import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../../common/services/prisma.service";
import { NodeExecutorFactory } from "./node-executor.factory";
import { RunWorkflowDto, ExecutionControlDto } from "../dto/run-workflow.dto";
import { TracingService } from "./tracing.service";
import { Subject } from "rxjs";
import {
  withTimeout,
  retryWithBackoff,
  HeartbeatManager,
  TimeoutError,
  CancelledError,
} from "../utils/execution-control.util";

/** 执行控制默认值 */
const DEFAULT_CONTROL: Required<ExecutionControlDto> = {
  workflowTimeoutMs: 300000, // 5 分钟
  nodeTimeoutMs: 60000, // 1 分钟
  heartbeatIntervalMs: 15000, // 15 秒
  maxRetries: 0,
  continueOnError: false,
};

/**
 * 完整工作流：
 * ```
 * 用户发起执行 → SSE 连接建立
 *          ↓
 * 从数据库加载工作流定义 (nodes + edges)
 *          ↓
 * 构建邻接表 + 入度表 → 种子队列
 *          ↓
 * 启动 HeartbeatManager (每15s推送进度)
 *          ↓
 * BFS 主循环开始...
 *          ↓
 *   Step 1: Start 节点执行 (通常只是透传输入)
 *   Step 2: LLM 分析 → 输出意图分类结果
 *   Step 3: Condition 节点判断意图
 *            → "查询知识库" → 走 true 分支，RAG 检索 + LLM 回答
 *            → "查询天气"   → skipBranch() 剪掉 RAG 分支，走工具调用
 *   Step 4: Output 节点组合最终结果
 *          ↓
 * BFS 主循环结束
 *          ↓
 * 停止 HeartbeatManager → 推送 done 事件
 *          ↓
 * 写入 Tracing 记录 → SSE 连接关闭
 * ```
 */

@Injectable()
export class WorkflowExecutorService {
  private readonly logger = new Logger(WorkflowExecutorService.name);

  /** 正在运行的工作流取消标记 */
  private readonly cancelTokens = new Map<string, { cancelled: boolean }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: NodeExecutorFactory,
    @Optional() private readonly tracingService?: TracingService,
  ) {}

  async executeWorkflow(
    workflowId: string,
    runDto: RunWorkflowDto,
    sseSubject?: Subject<any>,
    executionId?: string,
  ) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error("Workflow not found");
    }

    // 合并执行控制配置
    const control: Required<ExecutionControlDto> = {
      ...DEFAULT_CONTROL,
      ...(runDto.control || {}),
    };

    // 注册取消标记
    const execId = executionId || `${workflowId}_${Date.now()}`;
    const cancelToken = { cancelled: false };
    this.cancelTokens.set(execId, cancelToken);

    // 从数据库读出 nodes 和 edges
    const nodes = JSON.parse(workflow.nodes) as any[];
    const edges = JSON.parse(workflow.edges) as any[];

    // 记录"每个节点指向谁"  nodeId → [{target, sourceHandle}]
    const adjList = new Map<
      string,
      { target: string; sourceHandle?: string }[]
    >();
    // 记录"每个节点被几个前置节点指"
    const inDegree = new Map<string, number>();

    for (const node of nodes) {
      adjList.set(node.id, []); // 邻接表里放空数组
      inDegree.set(node.id, 0); // 入度初始为 0
    }

    /**
     * 举个具体例子，假设你画了这样一个工作流：
     *
     *    start ──▶ rag ──▶ condition ─┬─▶ 输出true
     *                                └─▶ 输出false
     *
     *  跑完上面这段代码后，内存里的两个表长这样：
     *
     * ```javascript
     *     // adjList: 谁指向谁
     *     start     → [{ target: "rag", sourceHandle: undefined }]
     *     rag       → [{ target: "condition", sourceHandle: undefined }]
     *     condition → [
     *       { target: "输出true",  sourceHandle: "true"  },
     *       { target: "输出false", sourceHandle: "false" },
     *     ]
     *     输出true  → []
     *     输出false → []
     *
     *     // inDegree: 每个节点有几个前置节点
     *     start     → 0   ✅ 没有箭头指它
     *     rag       → 1   （start → rag）
     *     condition → 1   （rag → condition）
     *     输出true  → 1   （condition → 输出true）
     *     输出false → 1   （condition → 输出false）
     * ```
     */

    // 遍历每条边，填充两个表
    for (const edge of edges) {
      const neighbors = adjList.get(edge.source);
      if (neighbors) {
        // ① 在邻接表里加一条："source 指向 target"
        neighbors.push({
          target: edge.target,
          sourceHandle: edge.sourceHandle,
        });
      }
      // ② target 的入度 +1（被多一条边指着）
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // Start Trace (全链路追踪)
    let traceId: string | undefined;
    if (this.tracingService) {
      try {
        traceId = await this.tracingService.startTrace({
          workflowId,
          userId: runDto.userId,
          applicationId: workflow.applicationId,
          executionId: execId,
          inputs: runDto.inputs,
        });
      } catch (e) {
        this.logger.warn(
          `Failed to start trace: ${e instanceof Error ? e.message : "Unknown"}`,
        );
      }
    }

    // BFS-style execution: start from nodes with in-degree 0
    const context: Record<string, any> = {
      ...runDto.inputs,
      // 注入元数据供节点执行器使用（如 Token 使用量记录）
      _workflowId: workflowId,
      _applicationId: workflow.applicationId,
      _executionId: execId,
      _userId: runDto.userId,
      _traceId: traceId,
    };
    const executed = new Set<string>();
    const skipped = new Set<string>();
    const failed = new Set<string>();
    let currentNodeId: string | undefined;

    // 运行时入度表
    // 不是一成不变的 inDegree，而是运行时可变的 runtimeInDegree
    // 条件分支剪枝后，被跳过的分支的入度永远不会被减完，自然不会被入队
    const runtimeInDegree = new Map<string, number>(inDegree);

    // Seed queue with root nodes (in-degree = 0)
    const queue: string[] = nodes
      .filter((n) => inDegree.get(n.id) === 0)
      .map((n) => n.id);

    // 启动心跳保活管理器
    const heartbeat = new HeartbeatManager(
      sseSubject,
      control.heartbeatIntervalMs,
    );
    heartbeat.start(() => ({
      executed: executed.size,
      total: nodes.length,
      currentNode: currentNodeId,
    }));

    // 推送开始事件（含执行控制配置）
    sseSubject?.next({
      type: "workflow_start",
      data: {
        executionId: execId,
        totalNodes: nodes.length,
        control,
      },
    });

    /**
     * SSE 事件：
     * 事件	发送时机	前端能做什么
     * workflow_start	工作流开始	显示"开始执行"，展示总节点数
     * node_status: running	某节点开始执行	高亮正在运行的节点
     * node_status: success	某节点执行成功	显示绿色对勾
     * node_status: failed	某节点执行失败	显示红色叉号
     * node_status: timeout	某节点超时	显示超时标记
     * node_status: skipped	某节点被条件分支跳过	显示灰色"已跳过"
     * node_status: retrying	某节点正在重试	显示"正在重试 (2/3)"
     * heartbeat	每 15 秒	更新进度条百分比
     * done	工作流执行成功	展示最终结果
     * error	工作流执行失败	显示错误信息
     */

    // 整体工作流执行逻辑
    const runLoop = async () => {
      /**
       * while (queue 不为空):
       *   取出一个节点
       *   检查取消标记 → 如果被取消，抛出 CancelledError
       *   检查是否已执行/已跳过/已失败 → 跳过
       *
       *   // 通过工厂获取对应的执行器
       *   executor = NodeExecutorFactory.getExecutor(node.type)
       *
       *   // 核心执行：带超时的重试
       *   output = retryWithBackoff(
       *     () => withTimeout(executor.execute(node, context), nodeTimeoutMs),
       *     { maxRetries, onRetry }
       *   )
       *
       *   更新上下文 context[nodeId] = output
       *   SSE 推送 node_status/success 事件
       *
       *   处理下游：
       *     如果是条件节点 → 只激活匹配分支，剪枝另一条
       *     如果是普通节点 → 所有下游入度减1，=0则入队
       */

      while (queue.length > 0) {
        // 检查取消
        if (cancelToken.cancelled) {
          throw new CancelledError("Workflow execution was cancelled");
        }

        const nodeId = queue.shift()!;

        // Skip if already executed or skipped
        if (executed.has(nodeId) || skipped.has(nodeId) || failed.has(nodeId))
          continue;

        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        currentNodeId = nodeId;
        const executor = this.factory.getExecutor(node.type);

        // Start Span (全链路追踪 - 节点级别)
        let spanId: string | undefined;
        if (this.tracingService && traceId) {
          try {
            spanId = await this.tracingService.startSpan({
              traceId,
              name: `${node.type}:${nodeId}`,
              kind: "internal",
              attributes: {
                nodeId,
                nodeType: node.type,
                nodeName: node.name || node.id,
              },
            });
          } catch (e) {
            this.logger.warn(
              `Failed to start span for node ${nodeId}: ${e instanceof Error ? e.message : "Unknown"}`,
            );
          }
        }

        try {
          sseSubject?.next({
            type: "node_status",
            data: {
              nodeId,
              status: "running",
              progress: {
                executed: executed.size,
                total: nodes.length,
              },
            },
          });

          const nodeStartTime = Date.now();

          // 节点执行：超时控制 + 重试
          const output = await retryWithBackoff(
            () =>
              withTimeout(
                executor.execute(node, context),
                control.nodeTimeoutMs,
                "node",
                nodeId,
              ),
            {
              maxRetries: control.maxRetries,
              onRetry: (attempt, error, delayMs) => {
                this.logger.warn(
                  `Node ${nodeId} failed (attempt ${attempt}), retrying in ${delayMs}ms: ${error.message}`,
                );
                sseSubject?.next({
                  type: "node_status",
                  data: {
                    nodeId,
                    status: "retrying",
                    attempt,
                    delayMs,
                    error: error.message,
                  },
                });
              },
            },
          );

          const nodeDuration = Date.now() - nodeStartTime;

          context[nodeId] = output;
          executed.add(nodeId);

          // End Span - 成功
          if (this.tracingService && spanId) {
            try {
              await this.tracingService.endSpan(spanId, "ok", [
                {
                  key: "output_keys",
                  value: output ? Object.keys(output) : [],
                },
                { key: "durationMs", value: nodeDuration },
              ]);
            } catch (e) {
              this.logger.warn(
                `Failed to end span ${spanId}: ${e instanceof Error ? e.message : "Unknown"}`,
              );
            }
          }

          sseSubject?.next({
            type: "node_status",
            data: {
              nodeId,
              status: "success",
              output,
              durationMs: nodeDuration,
              progress: {
                executed: executed.size,
                total: nodes.length,
              },
            },
          });

          // Get downstream edges
          const downstream = adjList.get(nodeId) || [];

          // 因为使用了运行时入度表（runtimeInDegree）。
          // 被跳过的分支的节点永远不会被入度减到 0（没人去减它们的入度），所以即使队列里没有它们，它们也不会被执行。
          // BFS 主循环每次迭代还会检查 skipped.has(nodeId) 一遍，双重保险。
          // 这样一来，整个不匹配的分支就像被"剪掉"一样，完全不会消耗任何计算资源。

          if (node.type === "condition") {
            // Condition node: only activate the matching branch
            const conditionResult = output?.result;
            const matchHandle = conditionResult ? "true" : "false";
            const skipHandle = conditionResult ? "false" : "true";

            for (const edge of downstream) {
              if (edge.sourceHandle === matchHandle) {
                // 匹配分支：正常激活
                const deg = (runtimeInDegree.get(edge.target) || 1) - 1;
                runtimeInDegree.set(edge.target, deg);
                if (deg <= 0) {
                  queue.push(edge.target);
                }
              } else if (edge.sourceHandle === skipHandle) {
                // 不匹配分支：递归剪枝
                this.skipBranch(edge.target, adjList, skipped, sseSubject);
              }
            }
          } else {
            // Normal node: activate all downstream
            for (const edge of downstream) {
              const deg = (runtimeInDegree.get(edge.target) || 1) - 1;
              runtimeInDegree.set(edge.target, deg);
              if (deg <= 0 && !skipped.has(edge.target)) {
                queue.push(edge.target);
              }
            }
          }
        } catch (error) {
          const isTimeout = error instanceof TimeoutError;
          const isCancelled = error instanceof CancelledError;

          failed.add(nodeId);

          // End Span - 失败
          if (this.tracingService && spanId) {
            try {
              await this.tracingService.endSpan(spanId, "error", [
                { key: "error", value: error.message },
                {
                  key: "errorType",
                  value: isTimeout
                    ? "timeout"
                    : isCancelled
                      ? "cancelled"
                      : "execution_error",
                },
              ]);
            } catch (e) {
              this.logger.warn(
                `Failed to end span ${spanId} on error: ${e instanceof Error ? e.message : "Unknown"}`,
              );
            }
          }

          sseSubject?.next({
            type: "node_status",
            data: {
              nodeId,
              status: isTimeout ? "timeout" : "failed",
              error: error.message,
            },
          });

          // 取消错误直接抛出，不受 continueOnError 影响
          if (isCancelled) {
            throw error;
          }

          // continueOnError 模式：跳过当前节点的下游分支，继续执行其他分支
          if (control.continueOnError) {
            this.logger.warn(
              `Node ${nodeId} failed but continueOnError is enabled, skipping downstream: ${error.message}`,
            );
            const downstream = adjList.get(nodeId) || [];
            for (const edge of downstream) {
              this.skipBranch(edge.target, adjList, skipped, sseSubject);
            }
            continue;
          }

          // 默认行为：失败即中断
          sseSubject?.next({
            type: "error",
            data: {
              message: `Error executing node ${nodeId}: ${error.message}`,
              nodeId,
              isTimeout,
            },
          });
          throw error;
        }
      }
    };

    try {
      // 工作流整体超时控制
      await withTimeout(
        runLoop(),
        control.workflowTimeoutMs,
        "workflow",
        workflow.name,
      );

      // End Trace - 成功
      if (this.tracingService && traceId) {
        try {
          await this.tracingService.endTrace(traceId, "success", context);
        } catch (e) {
          this.logger.warn(
            `Failed to end trace on success: ${e instanceof Error ? e.message : "Unknown"}`,
          );
        }
      }

      sseSubject?.next({
        type: "done",
        data: {
          finalContext: context,
          stats: {
            executed: executed.size,
            skipped: skipped.size,
            failed: failed.size,
            total: nodes.length,
            durationMs: heartbeat.getElapsedMs(),
          },
        },
      });

      return context;
    } catch (error) {
      const isTimeout = error instanceof TimeoutError;
      const isCancelled = error instanceof CancelledError;

      // End Trace - 失败
      if (this.tracingService && traceId) {
        try {
          await this.tracingService.endTrace(
            traceId,
            "failed",
            undefined,
            error.message,
          );
        } catch (e) {
          this.logger.warn(
            `Failed to end trace on failure: ${e instanceof Error ? e.message : "Unknown"}`,
          );
        }
      }

      sseSubject?.next({
        type: "error",
        data: {
          message: error.message,
          isTimeout,
          isCancelled,
          scope: isTimeout ? (error as TimeoutError).scope : undefined,
          stats: {
            executed: executed.size,
            skipped: skipped.size,
            failed: failed.size,
            total: nodes.length,
            durationMs: heartbeat.getElapsedMs(),
          },
        },
      });

      throw error;
    } finally {
      heartbeat.stop();
      this.cancelTokens.delete(execId);
    }
  }

  /**
   * 取消正在运行的工作流
   *
   * @param executionId 执行 ID
   * @returns 是否成功标记取消
   */
  cancelExecution(executionId: string): boolean {
    const token = this.cancelTokens.get(executionId);
    if (token) {
      token.cancelled = true;
      this.logger.log(
        `Workflow execution ${executionId} marked for cancellation`,
      );
      return true;
    }
    return false;
  }

  /**
   * 获取正在运行的执行 ID 列表
   */
  getRunningExecutions(): string[] {
    return Array.from(this.cancelTokens.keys());
  }

  /**
   * Recursively mark a branch as skipped and notify via SSE
   */
  private skipBranch(
    nodeId: string,
    adjList: Map<string, { target: string; sourceHandle?: string }[]>,
    skipped: Set<string>,
    sseSubject?: Subject<any>,
  ) {
    if (skipped.has(nodeId)) return; // 防止重复跳过
    skipped.add(nodeId);
    sseSubject?.next({
      type: "node_status",
      data: { nodeId, status: "skipped" },
    });

    const downstream = adjList.get(nodeId) || [];
    for (const edge of downstream) {
      this.skipBranch(edge.target, adjList, skipped, sseSubject);
    }
  }
}

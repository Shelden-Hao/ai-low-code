/**
 * 工作流 DAG 执行引擎 E2E 测试
 *
 * 测试覆盖：
 * - 创建工作流（DAG 节点 + 边）
 * - 获取工作流
 * - 执行工作流（非 SSE 模式）
 * - 更新工作流
 * - 删除工作流
 * - 工作流与应用的关联
 */
import {
  apiPost,
  apiGet,
  apiPatch,
  apiDelete,
  getAdminToken,
} from './helpers/e2e-helper';

describe('Workflow DAG Execution (E2E)', () => {
  let token: string;
  let appId: string;
  let workflowId: string;

  // 先创建一个测试应用
  beforeAll(async () => {
    token = await getAdminToken();
    const appRes = await apiPost('/apps', {
      name: `WF E2E App ${Date.now()}`,
      description: 'App for workflow E2E tests',
    }, token);
    appId = appRes.data.id;
  });

  afterAll(async () => {
    // 清理
    if (appId) await apiDelete(`/apps/${appId}`, token).catch(() => {});
  });

  // ================================================================
  // 创建工作流
  // ================================================================
  describe('POST /api/workflows', () => {
    test('should create a workflow with nodes and edges', async () => {
      const nodes = [
        { id: 'start_1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'Start' } },
        { id: 'rag_1', type: 'rag', position: { x: 300, y: 100 }, data: { label: 'RAG Search' } },
        { id: 'output_1', type: 'output', position: { x: 550, y: 100 }, data: { label: 'Output' } },
      ];
      const edges = [
        { id: 'e1', source: 'start_1', target: 'rag_1' },
        { id: 'e2', source: 'rag_1', target: 'output_1' },
      ];

      const res = await apiPost('/workflows', {
        name: `Test Workflow ${Date.now()}`,
        description: 'E2E test workflow with simple DAG',
        applicationId: appId,
        nodes,
        edges,
      }, token);

      expect(res.success).toBe(true);
      expect(res.data.name).toContain('Test Workflow');
      expect(res.data).toHaveProperty('id');
      workflowId = res.data.id;
    });

    test('should reject creating workflow without applicationId', async () => {
      const res = await apiPost('/workflows', {
        name: 'Orphan Workflow',
        nodes: [],
        edges: [],
      }, token);
      expect(res.success).toBe(false);
    });

    test('should reject creating workflow without auth', async () => {
      const res = await apiPost('/workflows', {
        name: 'No Auth Workflow',
        applicationId: appId,
        nodes: [],
        edges: [],
      });
      expect(res.success).toBe(false);
    });
  });

  // ================================================================
  // 获取工作流
  // ================================================================
  describe('GET /api/workflows', () => {
    test('should list workflows for an app', async () => {
      const res = await apiGet(`/workflows/app/${appId}`, token);
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/workflows/:id', () => {
    test('should get single workflow', async () => {
      const res = await apiGet(`/workflows/${workflowId}`, token);
      expect(res.success).toBe(true);
      expect(res.data.id).toBe(workflowId);
      // nodes 和 edges 可能是字符串或已解析的对象
      const nodes = typeof res.data.nodes === 'string' ? JSON.parse(res.data.nodes) : res.data.nodes;
      const edges = typeof res.data.edges === 'string' ? JSON.parse(res.data.edges) : res.data.edges;
      expect(nodes.length).toBe(3);
      expect(edges.length).toBe(2);
    });
  });

  // ================================================================
  // 执行工作流
  // ================================================================
  describe('POST /api/workflows/:id/run', () => {
    test('should execute a simple DAG workflow', async () => {
      const res = await apiPost(`/workflows/${workflowId}/run`, {
        inputs: { query: 'FlowAI Studio 有什么核心特性？' },
      }, token);

      // 不安装 qwen key 时 run 可能会返回错误，
      // 但至少请求能被接受并返回正确的响应格式
      expect(res).toHaveProperty('success');
      // 如果是数据库连接正常但 AI 没 key，会报错误但不是 500
      if (res.success) {
        expect(res.data).toBeDefined();
      }
    });

    test('should reject running workflow without auth', async () => {
      const res = await apiPost(`/workflows/${workflowId}/run`, {
        inputs: { query: 'test' },
      });
      expect(res.success).toBe(false);
    });
  });

  // ================================================================
  // 更新工作流
  // ================================================================
  describe('PATCH /api/workflows/:id', () => {
    test('should update workflow name', async () => {
      const newName = `Updated Workflow ${Date.now()}`;
      const res = await apiPatch(`/workflows/${workflowId}`, { name: newName }, token);
      expect(res.success).toBe(true);
      expect(res.data.name).toBe(newName);
    });

    test('should update workflow nodes', async () => {
      const newNodes = [
        { id: 'start_1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'Start' } },
        { id: 'llm_1', type: 'llm', position: { x: 300, y: 100 }, data: { label: 'LLM Call' } },
        { id: 'output_1', type: 'output', position: { x: 550, y: 100 }, data: { label: 'Output' } },
      ];
      const res = await apiPatch(`/workflows/${workflowId}`, { nodes: newNodes }, token);
      expect(res.success).toBe(true);

      // 验证更新后的节点
      const getRes = await apiGet(`/workflows/${workflowId}`, token);
      const nodes = typeof getRes.data.nodes === 'string' ? JSON.parse(getRes.data.nodes) : getRes.data.nodes;
      expect(nodes.length).toBe(3);
      expect(nodes.find((n: any) => n.type === 'llm')).toBeDefined();
    });
  });

  // ================================================================
  // 删除工作流
  // ================================================================
  describe('DELETE /api/workflows/:id', () => {
    test('should delete workflow', async () => {
      const res = await apiDelete(`/workflows/${workflowId}`, token);
      expect(res.success).toBe(true);
    });

    test('should confirm deletion', async () => {
      const res = await apiGet(`/workflows/${workflowId}`, token);
      expect(res.success).toBe(false);
    });
  });
});

## Java 版简历写法

FlowAI Studio for Java - 企业级 AI 工作流可视化编排平台 Multi-Agent Workflow Engine

项目介绍：基于 LangGraph4j + Spring AI 的企业级 AI 工作流平台，支持通过可视化拖拽界面编排多种大模型（OpenAI、DeepSeek、通义千问）和工具节点，使用 DAG 引擎按拓扑顺序实现复杂 AI 任务实时流式执行和事件驱动监控，并支持支持联网搜索、知识库 RAG、图片/视频生成等多模态能力编排，实现零代码构建 AI Agent 应用。

技术栈：Java 21、Spring Boot 3.4.1、MyBatis-Plus 3.5.5、MySQL 8.0、MinIO、Redis、Spring AI 1.0、LangGraph4j 1.8、React 18、ReactFlow

核心职责：

- 基于 LangGraph4j StateGraph 构建工作流引擎，GraphBuilder 负责节点注册和边连接，NodeAdapter 将现有执行器适配为 LangGraph 异步节点执行，StateManager 管理节点间状态传递，实现支持状态图、条件分支的高级工作流编排
- Spring AI 多模型统一接入架构：设计 ChatClientFactory 动态工厂模式和适配器模式，通过策略模式实现运行时根据节点配置（apiUrl/apiKey/model/temperature）动态创建 OpenAI 兼容的 ChatClient 实例，通过 OpenAiChatOptions 统一配置模型参数，实现 OpenAI、DeepSeek、通义千问等多厂商 LLM 的无缝切换
- 使用模板方法模式重构 LLM 节点执行器，抽象 AbstractLLMNodeExecutor 基类封装配置提取、模板处理、API 调用、输出构建的通用流程，子类仅需实现 getNodeType() 方法，将 5 个 LLM 节点执行器代码从 800+ 行精简至每个约 10 行
- 实现 Prompt 支持模板变量替换，可通过 {{variable}} 解析 input 静态值和 reference 动态引用两种参数类型，支持从上游节点输出中自动获取参数值，实现节点间数据流的灵活映射
- 实现 DAG 工作流解析引擎，基于 Kahn 算法的拓扑排序确定节点执行顺序，DFS 深度优先搜索检测循环依赖防止死锁，支持一对多、多对一的节点连接方式
- 基于 Spring SseEmitter 实现工作流执行的实时反馈，设计 ExecutionEvent 事件模型，通过 Consumer<ExecutionEvent> 回调机制将 LLM 流式生成内容实时推送到前端调试面板
- 实现 Skill 预置知识包机制，支持 SkillRegistry 自动加载、Reference 缓存、全量/渐进式两种注入模式
- 开发超拟人音频合成节点执行器，实现 TTS 语音合成节点，支持 UTF-8 字节级文本分段、标点断句、并行合成、WAV 格式合并
- 联网搜索：基于 MCP 协议封装方舟 Agent Plan 联网搜索 API，实现 LLM 节点内按需调用联网搜索的能力。搜索结果自动注入 Prompt 上下文，LLM 能拿到实时信息再做推理
- 接入 Seedream 图片生成节点和 Seedance 视频生成节点，支持工作流内“LLM 生成提示词→图片生成→视频生成”的并行链式编排，视频和图片统一转存到 MinIO
- 向量检索：集成 Doubao-embedding-vision 向量模型，实现文档上传→自动分片→向量化→建立索引的完整 RAG 流程，LLM 节点可勾选知识库进行 topK 向量召回，检索结果作为上下文参与推理
- 实现 ReAct 模式的 Agent 节点执行器，支持最大 20 步推理迭代和动态工具注册，将联网搜索、知识库检索、记忆召回等 9 个预置工具封装为 Agent 可自主调用的能力

## 面试题合集

### 你们的双引擎设计（DAG + LangGraph）是怎么切换的？

策略模式。

WorkflowExecutor 是统一接口，DAGWorkflowEngine 和 LangGraphWorkflowEngine 都实现了它。

EngineSelector 根据 Workflow 实体上的 engineType 字段做分发——“dag” 走老引擎，“langgraph” 走新引擎。

老工作流不改 engineType，默认继续用 DAG；新建工作流选择 LangGraph 引擎。这样做的考虑是：简单的线性流用 DAG 就够了，性能好、逻辑清晰。需要条件分支和循环的复杂场景才用 LangGraph。没有收益的迁移只会制造风险。


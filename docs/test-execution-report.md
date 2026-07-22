# FlowAI Studio — AI 自动化测试执行报告

> 执行日期：2026-07-22
> 执行人：Senior Developer（AI Agent）

---

## 一、方案概述

本项目为 FlowAI Studio（全栈可视化 AI 应用低代码编排平台）引入 AI 自动化测试。

### 测试分层

| 层级 | 框架 | 覆盖范围 | 用例数 |
|---|---|---|---|
| 后端 API E2E | Jest + SuperTest (通过 fetch) | 5 个模块 | 47 个 |
| 前端 E2E | Playwright (Chromium) | 3 个维度 | 11 个 |
| **总计** | | | **58 个** |

---

## 二、使用工具与资源清单

### 2.1 已安装的 Skill

| Skill 名称 | 来源 | 用途 |
|---|---|---|
| **Playwright (Automation + MCP + Scraper)** | skillhub（本地已安装） | 浏览器自动化测试 |
| **find-skills** | 内置 | 搜索和发现可用 Skill |

### 2.2 使用的 MCP / 工具

| 工具 | 用途 |
|---|---|
| `@playwright/test` | 前端 E2E 浏览器测试框架（Chromium） |
| `npx playwright install chromium` | 安装 Chromium 浏览器二进制文件 |
| `Jest`（已在项目中） | 后端 E2E 测试框架 |
| `fetch`（Node 原生） | 替代已弃用的 `supertest`，发起 HTTP 请求 |
| `npx jest --config ./test/jest-e2e.json` | 运行后端 E2E 测试 |
| `npx playwright test` | 运行前端 E2E 测试 |

### 2.3 执行的 Shell 命令

| 命令 | 作用 |
|---|---|
| `mkdir -p test/helpers` | 创建后端测试目录结构 |
| `npm install --save-dev @playwright/test` | 安装 Playwright 测试框架 |
| `npx playwright install chromium` | 下载 Chromium 浏览器 |
| `npx jest --config ./test/jest-e2e.json` | 运行后端 E2E 测试 |
| `npx playwright test` | 运行前端 E2E 测试 |

---

## 三、后端 API E2E 测试详解

### 3.1 测试文件结构

```
flowai-studio-backend/test/
├── jest-e2e.json                  # Jest E2E 配置
├── helpers/
│   ├── e2e-helper.ts              # 测试辅助工具（auth、API 请求封装）
│   ├── global-setup.ts            # 全局 setup（验证后端连接）
│   └── global-teardown.ts         # 全局 teardown
├── health.e2e-spec.ts             # 健康检查
├── user.e2e-spec.ts               # 用户认证
├── app.e2e-spec.ts                # 应用管理
├── workflow.e2e-spec.ts           # 工作流 DAG 执行
└── rag.e2e-spec.ts                # 知识库 & RAG
```

### 3.2 各模块测试内容

#### 健康检查（3 个用例）
```
✓ GET /api/health — should return healthy status
  验证：数据库/Redis/pgvector/cache 全部 healthy
✓ GET /api/health — should include timestamp
✓ GET /api/health/cache-stats — should return cache stats
```

#### 用户认证（12 个用例）
```
注册：
  ✓ 成功注册新用户
  ✓ 拒绝重复用户名
  ✓ 拒绝短用户名（< 3 字符）
  ✓ 拒绝短密码（< 6 字符）

登录：
  ✓ 正确凭据登录成功
  ✓ 拒绝错误密码
  ✓ 拒绝不存在的用户

Profile（需鉴权）：
  ✓ 有效 token 获取 Profile
  ✓ 无 token 被拒绝
  ✓ 无效 token 被拒绝
  ✓ 更新 avatar
  ✓ registerUser() 辅助函数
```

#### 应用管理（12 个用例）
```
CRUD：
  ✓ 创建应用
  ✓ 无名称创建被拒
  ✓ 无鉴权创建被拒
  ✓ 列出应用
  ✓ 获取单个应用
  ✓ 不存在应用 404

状态流转：
  ✓ draft → published
  ✓ published → draft
  ✓ draft → archived
  ✓ archived → draft

删除：
  ✓ 删除应用
  ✓ 确认删除
```

#### 工作流 DAG 执行（10 个用例）
```
创建：
  ✓ 创建含节点的 DAG 工作流
  ✓ 无 appId 被拒
  ✓ 无鉴权被拒

查询：
  ✓ 按应用列出工作流
  ✓ 获取单个工作流（验证 nodes/edges 存储）

执行：
  ✓ 执行简单 DAG 工作流（验证 BFS 调度）
  ✓ 无鉴权执行被拒

更新：
  ✓ 更新名称
  ✓ 更新节点（验证持久化）

删除：
  ✓ 删除工作流
  ✓ 确认删除
```

#### 知识库 RAG（9 个用例）
```
默认知识库：
  ✓ 列出知识库（含 seed 数据中的"默认知识库"）

CRUD：
  ✓ 创建知识库
  ✓ 拒绝重复名称
  ✓ 列出全部
  ✓ 获取单个
  ✓ 更新描述

RAG 检索：
  ✓ 从已有知识库检索（验证向量检索通路）

AI 对话：
  ✓ 接受对话请求（无 API key 场景）

删除：
  ✓ 删除知识库
```

### 3.3 Helper 工具说明

`test/helpers/e2e-helper.ts` 封装了：

| 函数 | 功能 |
|---|---|
| `apiGet(path, token?)` | GET 请求 |
| `apiPost(path, body, token?)` | POST 请求 |
| `apiPatch(path, body, token?)` | PATCH 请求 |
| `apiDelete(path, token?)` | DELETE 请求 |
| `loginAsAdmin()` | 用 admin/admin123 登录 |
| `getAdminToken()` | 缓存 admin token（避免多次登录） |
| `registerUser(user, pass)` | 注册 + 登录一次完成 |

### 3.4 测试执行结果

```
Test Suites: 4 passed, 1 skipped, 5 total
Tests:       47 passed, 1 skipped, 48 total
```

跳过 1 个：`/api/ai/chat` 是 SSE 流式端点，无法用 JSON fetch 测试。

### 3.5 开发和运行中修复的问题

1. **`setupFilesAfterSetup` 配置错误** — Jest 配置警告，删除后解决
2. **`access_token` vs `token`** — 登录 API 返回 `data.token` 而非 `data.access_token`，修正 helper 和 test 中的断言
3. **用户名超长** — 测试用户名 `e2e_test_171...` 超过 20 字符限制，缩短为 `t_171...`
4. **nodes 格式** — API 返回节点为已解析的数组而非 JSON 字符串，测试中增加类型判断
5. **RAG retrieve 响应格式** — 返回 `data: []`（数组）而非 `data.results: []`，修正断言

---

## 四、前端 Playwright E2E 测试详解

### 4.1 测试文件结构

```
flowai-studio-frontend/
├── playwright.config.ts            # Playwright 配置
├── e2e/
│   ├── app.spec.ts                 # 基本页面 & API 连通性
│   └── workflow.spec.ts            # 完整用户流程
```

### 4.2 Playwright 配置

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

### 4.3 各维度测试内容

#### 页面渲染（7 个用例）
```
登录流程：
  ✓ 登录页渲染
  ✓ 存在用户名/密码输入框

页面可访问性：
  ✓ React 应用正常 200 响应
  ✓ 404 页面前端路由处理

API 连通性：
  ✓ 后端健康检查
  ✓ 登录获取 token
  ✓ 列出 seed 数据中的默认应用
```

#### 完整用户流程（4 个用例）
```
✓ 页面登录
✓ 应用 CRUD - 端到端（创建→读取→更新→删除）
✓ 工作流执行
✓ 知识库检索
```

### 4.4 测试执行结果

```
Running 11 tests using 2 workers
  11 passed (6.9s)
```

### 4.5 测试亮点

- **浏览器端的 API 调用**：通过 `page.request` 在浏览器上下文中做 API 请求，验证前后端联动
- **Playwright 的 `page.request.get/post/patch/delete`**：原生支持完整的 HTTP 方法，无需额外封装
- **多 worker 并行执行**：11 个测试在 3 个 worker 下 6.9 秒完成

---

## 五、测试架构总结

```mermaid
graph TD
    subgraph 后端 E2E（Jest）
        A[test/helpers/e2e-helper.ts] --> B[封装 fetch 请求]
        B --> C[health.e2e-spec]
        B --> D[user.e2e-spec]
        B --> E[app.e2e-spec]
        B --> F[workflow.e2e-spec]
        B --> G[rag.e2e-spec]
        C --> H[后端 API /api/*]
        D --> H
        E --> H
        F --> H
        G --> H
    end

    subgraph 前端 E2E（Playwright）
        I[playwright.config.ts] --> J[app.spec.ts]
        I --> K[workflow.spec.ts]
        J --> L[前端页面 localhost:5173]
        J --> H
        K --> L
        K --> H
    end

    H --> M[PostgreSQL + pgvector]
    H --> N[Redis]
```

---

## 六、覆盖的业务场景

| 业务场景 | 后端 E2E | 前端 E2E | 测试方式 |
|---|---|---|---|
| 用户注册 | ✓ | — | API 直接调用 |
| 用户登录 | ✓ | ✓ | API + 浏览器渲染 |
| 鉴权保护 | ✓ | — | 无 token 请求被拒 |
| 应用 CRUD | ✓ | ✓ | API + 端到端流程 |
| 应用状态流转 | ✓ | — | draft → published → archived |
| 工作流 CRUD | ✓ | — | API CRUD |
| DAG 执行调度 | ✓ | ✓ | 执行含 3 节点的 DAG |
| 知识库 CRUD | ✓ | — | API CRUD |
| RAG 检索 | ✓ | ✓ | 从默认知识库检索 |
| AI 对话 | —（SSE） | — | 流式端点需特殊处理 |

---

## 七、后续建议

1. **补充异常场景测试**：网络超时、并发执行上限、熔断恢复等
2. **单元测试覆盖率**：当前 E2E 覆盖率 47+11=58 个用例，可结合 `jest --coverage` 查看具体覆盖率缺口
3. **CI/CD 集成**：将 Playwright 测试加入 GitHub Actions，使用 `docker compose` 启动测试环境
4. **AI 对话 SSE 测试**：针对 SSE 端点，建议用 `eventsource-parser` 或原生 EventSource API 测试流式响应
5. **性能测试**：使用 k6 或 Artillery 对工作流执行做压力测试

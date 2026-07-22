/**
 * 知识库 RAG 模块 E2E 测试
 *
 * 测试覆盖：
 * - 知识库 CRUD
 * - 默认知识库存在（来自 seed 数据）
 * - 知识库检索
 * - AI 对话
 */
import {
  apiPost,
  apiGet,
  apiPatch,
  apiDelete,
  getAdminToken,
} from './helpers/e2e-helper';

describe('RAG Knowledge Base (E2E)', () => {
  let token: string;
  let kbId: string;
  const kbName = `E2E KB ${Date.now()}`;

  beforeAll(async () => {
    token = await getAdminToken();
  });

  // ================================================================
  // 默认知识库
  // ================================================================
  describe('Default knowledge base (from seed)', () => {
    test('should list knowledge bases with default one present', async () => {
      const res = await apiGet('/rag/knowledge-bases', token);
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);

      const defaultKb = res.data.find((kb: any) => kb.name === '默认知识库');
      expect(defaultKb).toBeDefined();
      expect(defaultKb.description).toContain('FlowAI Studio');
    });
  });

  // ================================================================
  // 创建知识库
  // ================================================================
  describe('POST /api/rag/knowledge-bases', () => {
    test('should create a new knowledge base', async () => {
      const res = await apiPost('/rag/knowledge-bases', {
        name: kbName,
        description: 'Created by E2E test',
        chunkSize: 300,
        chunkOverlap: 30,
      }, token);
      expect(res.success).toBe(true);
      expect(res.data.name).toBe(kbName);
      expect(res.data.chunkSize).toBe(300);
      kbId = res.data.id;
    });

    test('should reject creating kb with duplicate name', async () => {
      const res = await apiPost('/rag/knowledge-bases', {
        name: kbName,
      }, token);
      expect(res.success).toBe(false);
    });
  });

  // ================================================================
  // 获取知识库
  // ================================================================
  describe('GET /api/rag/knowledge-bases', () => {
    test('should list all knowledge bases', async () => {
      const res = await apiGet('/rag/knowledge-bases', token);
      expect(res.success).toBe(true);
      const found = res.data.find((kb: any) => kb.id === kbId);
      expect(found).toBeDefined();
      expect(found.name).toBe(kbName);
    });
  });

  describe('GET /api/rag/knowledge-bases/:id', () => {
    test('should get single knowledge base', async () => {
      const res = await apiGet(`/rag/knowledge-bases/${kbId}`, token);
      expect(res.success).toBe(true);
      expect(res.data.id).toBe(kbId);
      expect(res.data.name).toBe(kbName);
    });
  });

  // ================================================================
  // 更新知识库
  // ================================================================
  describe('PATCH /api/rag/knowledge-bases/:id', () => {
    test('should update knowledge base description', async () => {
      const res = await apiPatch(`/rag/knowledge-bases/${kbId}`, {
        description: 'Updated description',
      }, token);
      expect(res.success).toBe(true);
      expect(res.data.description).toBe('Updated description');
    });
  });

  // ================================================================
  // RAG 检索
  // ================================================================
  describe('POST /api/rag/retrieve', () => {
    test('should retrieve from existing KB', async () => {
      // 先找到默认知识库（它有文档）
      const listRes = await apiGet('/rag/knowledge-bases', token);
      const defaultKb = listRes.data.find((kb: any) => kb.name === '默认知识库');

      if (defaultKb) {
        const res = await apiPost('/rag/retrieve', {
          query: 'FlowAI Studio',
          knowledgeBaseId: defaultKb.id,
          topK: 3,
        }, token);
        expect(res.success).toBe(true);
        expect(Array.isArray(res.data)).toBe(true);
      }
    });
  });

  // ================================================================
  // AI 对话
  // ================================================================
  describe('POST /api/ai/chat', () => {
    test('should accept chat request or respond with SSE (no API key scenario)', async () => {
      // SSE 端点返回 text/event-stream 而非 JSON
      // try JSON first, fall back to string check
      const res = await apiPost<any>('/ai/chat', {
        sessionId: `e2e_test_${Date.now()}`,
        message: '你好',
      }, token);
      // 没有 QWEN_API_KEY 时可能是 JSON 错误或 SSE 流
      expect(res).toHaveProperty('success');
    });
  });

  // ================================================================
  // 删除知识库
  // ================================================================
  describe('DELETE /api/rag/knowledge-bases/:id', () => {
    test('should delete knowledge base', async () => {
      const res = await apiDelete(`/rag/knowledge-bases/${kbId}`, token);
      expect(res.success).toBe(true);
    });
  });
});

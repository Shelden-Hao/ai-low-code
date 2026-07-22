/**
 * 健康检查 E2E 测试
 *
 * 测试基础设施：
 * - 后端服务是否可访问
 * - 数据库、Redis、pgvector 是否健康
 * - 并验证 API 统一响应格式
 */
import { apiGet } from './helpers/e2e-helper';

describe('Health Check (E2E)', () => {
  test('GET /api/health — should return healthy status', async () => {
    const res = await apiGet('/health');

    expect(res.success).toBe(true);
    expect(res.code).toBe('SUCCESS');
    expect(res.data.status).toBe('healthy');

    // 各组件健康
    expect(res.data.checks.database.status).toBe('healthy');
    expect(res.data.checks.redis.status).toBe('healthy');
    expect(res.data.checks.pgvector.status).toBe('healthy');
    expect(res.data.checks.cache.status).toBe('healthy');
  });

  test('GET /api/health — should include timestamp', async () => {
    const res = await apiGet('/health');
    expect(res.timestamp).toBeDefined();
    expect(new Date(res.timestamp).toISOString()).toBe(res.timestamp);
  });

  test('GET /api/health/cache-stats — should return cache stats', async () => {
    const res = await apiGet('/health/cache-stats');
    expect(res.success).toBe(true);
  });
});

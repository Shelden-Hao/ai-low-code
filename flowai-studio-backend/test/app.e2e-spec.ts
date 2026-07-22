/**
 * 应用管理模块 E2E 测试
 *
 * 测试覆盖：
 * - 创建应用
 * - 获取应用列表
 * - 获取单个应用
 * - 更新应用
 * - 删除应用
 * - 发布/取消发布/归档/取消归档
 */
import {
  apiPost,
  apiGet,
  apiPatch,
  apiDelete,
  getAdminToken,
} from './helpers/e2e-helper';

describe('Application Management (E2E)', () => {
  let token: string;
  let appId: string;
  const appName = `E2E Test App ${Date.now()}`;

  beforeAll(async () => {
    token = await getAdminToken();
  });

  // ================================================================
  // 创建应用
  // ================================================================
  describe('POST /api/apps', () => {
    test('should create a new application', async () => {
      const res = await apiPost('/apps', {
        name: appName,
        description: 'Created by E2E test',
      }, token);
      expect(res.success).toBe(true);
      expect(res.data.name).toBe(appName);
      expect(res.data.status).toBe('draft');
      appId = res.data.id;
    });

    test('should reject creating app without name', async () => {
      const res = await apiPost('/apps', { description: 'no name' }, token);
      expect(res.success).toBe(false);
    });

    test('should reject creating app without auth', async () => {
      const res = await apiPost('/apps', { name: 'Unauthorized App' });
      expect(res.success).toBe(false);
    });
  });

  // ================================================================
  // 获取应用列表
  // ================================================================
  describe('GET /api/apps', () => {
    test('should list applications', async () => {
      const res = await apiGet('/apps', token);
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
      const found = res.data.find((a: any) => a.id === appId);
      expect(found).toBeDefined();
      expect(found.name).toBe(appName);
    });
  });

  // ================================================================
  // 获取单个应用
  // ================================================================
  describe('GET /api/apps/:id', () => {
    test('should get single application', async () => {
      const res = await apiGet(`/apps/${appId}`, token);
      expect(res.success).toBe(true);
      expect(res.data.id).toBe(appId);
      expect(res.data.name).toBe(appName);
    });

    test('should return 404 for nonexistent app', async () => {
      const res = await apiGet('/apps/nonexistent-id', token);
      expect(res.success).toBe(false);
    });
  });

  // ================================================================
  // 更新应用
  // ================================================================
  describe('PATCH /api/apps/:id', () => {
    test('should update application name', async () => {
      const updatedName = `${appName} (Updated)`;
      const res = await apiPatch(`/apps/${appId}`, { name: updatedName }, token);
      expect(res.success).toBe(true);
      expect(res.data.name).toBe(updatedName);
    });
  });

  // ================================================================
  // 状态流转：发布 → 取消发布 → 归档 → 取消归档
  // ================================================================
  describe('Application status transitions', () => {
    test('should publish draft app', async () => {
      const res = await apiPatch(`/apps/${appId}/publish`, {}, token);
      expect(res.success).toBe(true);
      expect(res.data.status).toBe('published');
    });

    test('should unpublish published app', async () => {
      const res = await apiPatch(`/apps/${appId}/unpublish`, {}, token);
      expect(res.success).toBe(true);
      expect(res.data.status).toBe('draft');
    });

    test('should archive app', async () => {
      const res = await apiPatch(`/apps/${appId}/archive`, {}, token);
      expect(res.success).toBe(true);
      expect(res.data.status).toBe('archived');
    });

    test('should unarchive app', async () => {
      const res = await apiPatch(`/apps/${appId}/unarchive`, {}, token);
      expect(res.success).toBe(true);
      expect(res.data.status).toBe('draft');
    });
  });

  // ================================================================
  // 删除应用
  // ================================================================
  describe('DELETE /api/apps/:id', () => {
    test('should delete application', async () => {
      const res = await apiDelete(`/apps/${appId}`, token);
      expect(res.success).toBe(true);
    });

    test('should confirm deletion', async () => {
      const res = await apiGet(`/apps/${appId}`, token);
      expect(res.success).toBe(false);
    });
  });
});

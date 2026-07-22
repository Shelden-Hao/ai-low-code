/**
 * 用户认证模块 E2E 测试
 *
 * 测试覆盖：
 * - 用户注册（成功/重复/校验）
 * - 用户登录（成功/失败）
 * - 获取/更新 Profile（JWT 鉴权）
 * - 未鉴权请求被拒绝
 */
import {
  apiPost,
  apiGet,
  apiPatch,
  registerUser,
} from './helpers/e2e-helper';

describe('User Auth (E2E)', () => {
  const testUser = `t_${Date.now()}`;  // max 20 chars
  const testPass = 'test123456';
  let token: string;
  let userId: string;

  // ================================================================
  // 注册
  // ================================================================
  describe('POST /api/users/register', () => {
    test('should register a new user', async () => {
      const res = await apiPost('/users/register', {
        username: testUser,
        password: testPass,
      });
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('id');
      expect(res.data.username).toBe(testUser);
      userId = res.data.id;
    });

    test('should reject duplicate username', async () => {
      const res = await apiPost('/users/register', {
        username: testUser,
        password: testPass,
      });
      expect(res.success).toBe(false);
    });

    test('should reject short username (< 3 chars)', async () => {
      const res = await apiPost('/users/register', {
        username: 'ab',
        password: 'test123456',
      });
      expect(res.success).toBe(false);
    });

    test('should reject short password (< 6 chars)', async () => {
      const res = await apiPost('/users/register', {
        username: `short_${Date.now()}`,
        password: '12345',
      });
      expect(res.success).toBe(false);
    });
  });

  // ================================================================
  // 登录
  // ================================================================
  describe('POST /api/users/login', () => {
    test('should login with correct credentials', async () => {
      const res = await apiPost('/users/login', {
        username: testUser,
        password: testPass,
      });
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('token');
      expect(typeof res.data.token).toBe('string');
      token = res.data.token;
    });

    test('should reject wrong password', async () => {
      const res = await apiPost('/users/login', {
        username: testUser,
        password: 'wrongpassword',
      });
      expect(res.success).toBe(false);
    });

    test('should reject nonexistent user', async () => {
      const res = await apiPost('/users/login', {
        username: `nonexistent_${Date.now()}`,
        password: testPass,
      });
      expect(res.success).toBe(false);
    });
  });

  // ================================================================
  // Profile（需鉴权）
  // ================================================================
  describe('GET /api/users/profile', () => {
    test('should get profile with valid token', async () => {
      const res = await apiGet('/users/profile', token);
      expect(res.success).toBe(true);
      expect(res.data.username).toBe(testUser);
    });

    test('should reject request without token', async () => {
      const res = await apiGet('/users/profile');
      expect(res.success).toBe(false);
    });

    test('should reject request with invalid token', async () => {
      const res = await apiGet('/users/profile', 'invalid_token_here');
      expect(res.success).toBe(false);
    });
  });

  // ================================================================
  // 更新 Profile（需鉴权）
  // ================================================================
  describe('PATCH /api/users/profile', () => {
    test('should update profile avatar', async () => {
      const newAvatar = 'https://example.com/avatar.png';
      const res = await apiPatch('/users/profile', { avatar: newAvatar }, token);
      expect(res.success).toBe(true);
      expect(res.data.avatar).toBe(newAvatar);
    });
  });

  // ================================================================
  // token 辅助函数验证
  // ================================================================
  describe('Auth helper — registerUser()', () => {
    test('should register and login in one call', async () => {
      const tempUser = `h_${Date.now()}`;
      const result = await registerUser(tempUser, 'pass123456');
      expect(result.token).toBeDefined();
      expect(result.userId).toBeDefined();
    });
  });
});

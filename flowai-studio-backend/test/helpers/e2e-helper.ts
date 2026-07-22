/**
 * E2E 测试辅助工具
 *
 * 提供可复用的函数：
 * - loginAsAdmin() — 使用默认种子账号登录获取 token
 * - registerUser() — 注册新用户并登录
 * - apiGet() — GET 请求（可选带 token）
 * - apiPost() — POST 请求（可选带 token）
 * - apiPatch() — PATCH 请求（可选带 token）
 * - apiDelete() — DELETE 请求（可选带 token）
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

interface ApiResponse<T = any> {
  success: boolean;
  code: string;
  message: string;
  data: T;
  timestamp: string;
}

export async function apiGet<T = any>(
  path: string,
  token?: string,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return res.json();
}

export async function apiPost<T = any>(
  path: string,
  body: any,
  token?: string,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiPatch<T = any>(
  path: string,
  body: any,
  token?: string,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiDelete<T = any>(
  path: string,
  token?: string,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers,
  });
  return res.json();
}

export async function loginAsAdmin(): Promise<string> {
  const res = await apiPost<{ token: string }>('/users/login', {
    username: 'admin',
    password: 'admin123',
  });
  if (!res.success) throw new Error(`Login failed: ${res.message}`);
  return res.data.token;
}

let adminTokenCache: string | null = null;

export async function getAdminToken(): Promise<string> {
  if (adminTokenCache) return adminTokenCache;
  adminTokenCache = await loginAsAdmin();
  return adminTokenCache;
}

export async function registerUser(username: string, password: string): Promise<{ token: string; userId: string }> {
  const regRes = await apiPost<any>('/users/register', { username, password });
  if (!regRes.success) throw new Error(`Register failed: ${regRes.message}`);

  const loginRes = await apiPost<{ token: string }>('/users/login', { username, password });
  if (!loginRes.success) throw new Error(`Login after register failed: ${loginRes.message}`);

  return { token: loginRes.data.token, userId: regRes.data.id };
}

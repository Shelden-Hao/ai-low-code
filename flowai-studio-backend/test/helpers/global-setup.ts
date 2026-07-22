/**
 * 全局 E2E 测试设置
 * - 确保后端服务在运行（由开发者手动启动）
 * - 验证数据库连接可用
 */
import { execSync } from 'child_process';

export default async function globalSetup() {
  console.log('\n[GlobalSetup] Verifying backend connection...\n');

  try {
    const result = execSync(
      'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health',
      { timeout: 5000, encoding: 'utf-8' },
    );
    if (result.trim() === '200') {
      console.log('[GlobalSetup] Backend is running on http://localhost:3000');
    } else {
      console.warn(`[GlobalSetup] Backend returned status: ${result.trim()}`);
    }
  } catch (error) {
    console.warn(
      '[GlobalSetup] Could not connect to backend. Ensure: npm run start:dev is running on port 3000',
    );
  }
}

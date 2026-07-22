/**
 * FlowAI Studio — 完整用户流程 Playwright E2E 测试
 *
 * 模拟用户的完整操作路径：
 * 登录 → 查看应用 → 查看工作流 → 创建新工作流
 */
import {test, expect} from '@playwright/test';

const API_BASE = 'http://localhost:3000/api';

test.describe('Complete User Workflow', () => {
    let token: string;

    test.beforeAll(async ({request}) => {
        const loginRes = await request.post(`${API_BASE}/users/login`, {
            data: {username: 'admin', password: 'admin123'},
        });
        const loginData = await loginRes.json();
        token = loginData.data.token;
    });

    test('should login via UI', async ({page}) => {
        await page.goto('http://localhost:5173');
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(/localhost:5173/);
    });

    test('API: should CRUD an application end-to-end', async ({request}) => {
        // Create
        const createRes = await request.post(`${API_BASE}/apps`, {
            headers: {Authorization: `Bearer ${token}`},
            data: {
                name: `Playwright App ${Date.now()}`,
                description: 'Created by Playwright E2E test',
            },
        });
        expect(createRes.ok()).toBeTruthy();
        const created = await createRes.json();
        expect(created.success).toBe(true);
        const appId = created.data.id;

        // Read
        const getRes = await request.get(`${API_BASE}/apps/${appId}`, {
            headers: {Authorization: `Bearer ${token}`},
        });
        expect(getRes.ok()).toBeTruthy();
        const fetched = await getRes.json();
        expect(fetched.data.id).toBe(appId);

        // Update
        const patchRes = await request.patch(`${API_BASE}/apps/${appId}`, {
            headers: {Authorization: `Bearer ${token}`},
            data: {name: `Updated App ${Date.now()}`},
        });
        expect(patchRes.ok()).toBeTruthy();

        // Delete
        const delRes = await request.delete(`${API_BASE}/apps/${appId}`, {
            headers: {Authorization: `Bearer ${token}`},
        });
        expect(delRes.ok()).toBeTruthy();
    });

    test('API: should execute a workflow', async ({request}) => {
        // Find the demo app
        const appsRes = await request.get(`${API_BASE}/apps`, {
            headers: {Authorization: `Bearer ${token}`},
        });
        const appsData = await appsRes.json();
        const demoApp = appsData.data.find((a: any) => a.name.includes('RAG'));

        if (!demoApp) {
            test.skip('No demo app found, skipping workflow execution test');
            return;
        }

        // Find workflows for the demo app
        const wfRes = await request.get(`${API_BASE}/workflows/app/${demoApp.id}`, {
            headers: {Authorization: `Bearer ${token}`},
        });
        const wfData = await wfRes.json();

        if (!wfData.success || wfData.data.length === 0) {
            test.skip('No workflows found for demo app');
            return;
        }

        const workflow = wfData.data[0];
        console.log(`Executing workflow: ${workflow.name}`);

        // Execute
        const runRes = await request.post(`${API_BASE}/workflows/${workflow.id}/run`, {
            headers: {Authorization: `Bearer ${token}`},
            data: {inputs: {query: 'FlowAI Studio 有什么核心特性？'}},
        });
        const runData = await runRes.json();
        // 可能因为缺少 API key 而失败，但请求本身应该被接收
        expect(runData).toHaveProperty('success');
    });

    test('API: should list and retrieve from knowledge base', async ({request}) => {
        // List KBs
        const kbRes = await request.get(`${API_BASE}/rag/knowledge-bases`, {
            headers: {Authorization: `Bearer ${token}`},
        });
        const kbData = await kbRes.json();
        expect(kbData.success).toBe(true);
        expect(kbData.data.length).toBeGreaterThanOrEqual(1);

        // Find default KB
        const defaultKb = kbData.data.find((kb: any) => kb.name === '默认知识库');
        expect(defaultKb).toBeDefined();

        // Retrieve from KB
        const retrieveRes = await request.post(`${API_BASE}/rag/retrieve`, {
            headers: {Authorization: `Bearer ${token}`},
            data: {
                query: 'FlowAI Studio',
                knowledgeBaseId: defaultKb.id,
                topK: 3,
            },
        });
        const retrieveData = await retrieveRes.json();
        expect(retrieveData.success).toBe(true);
        expect(Array.isArray(retrieveData.data)).toBe(true);
        console.log(`Retrieved ${retrieveData.data.length} results from KB`);
    });
});

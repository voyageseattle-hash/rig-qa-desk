import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser-test', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4319', headless: true, viewport: { width: 1280, height: 1000 }, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) },
  webServer: { command: `"${process.execPath}" src/server.mjs --mock`, url: 'http://127.0.0.1:4319/api/status', reuseExistingServer: false, env: { RIG_QA_PORT: '4319', NEBIUS_API_KEY: '', NEBIUS_LIVE_ALLOWED: '' } },
});

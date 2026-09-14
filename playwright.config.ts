import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 90000,
  expect: { timeout: 15000 },
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: [
    {
      command: 'npm run chain:local',
      url: 'http://127.0.0.1:8545',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: `npm run setup:local && npm run ${process.env.CI ? 'start' : 'dev'}`,
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});

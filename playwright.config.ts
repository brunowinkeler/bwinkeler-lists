import { defineConfig, devices } from '@playwright/test';

const backendEnv: Record<string, string> = {
  NODE_ENV: 'development',
  HOST: '0.0.0.0',
  PORT: '8080',
  PUBLIC_ORIGIN: 'http://localhost:5173',
  PGHOST: process.env.PGHOST ?? '127.0.0.1',
  PGPORT: process.env.PGPORT ?? '5432',
  PGDATABASE: process.env.PGDATABASE ?? 'lists_dev',
  PGUSER: process.env.PGUSER ?? 'lists_dev',
  PGPASSWORD: process.env.PGPASSWORD ?? 'change-me-in-dev',
  SESSION_SECRET: 'e2e-session-secret-please-change',
  RATE_LIMIT_MAX: '1000',
  LOG_LEVEL: 'silent',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w @bwinkeler-lists/backend',
      url: 'http://localhost:8080/health/live',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: backendEnv,
    },
    {
      command: 'npm run dev -w @bwinkeler-lists/frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});

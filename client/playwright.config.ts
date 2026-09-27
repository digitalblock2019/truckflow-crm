import { defineConfig } from '@playwright/test';

// Two suites with different targets:
//   api — hits the Express API directly (no browser). Fast, and the right
//         place to assert server-enforced rules, since the UI can't prove a
//         rule holds when the request doesn't come from the UI.
//   ui  — drives the Next.js app in Chromium.
//
// Both expect a backend on :3000 and (for ui) a frontend on :3001, pointed at
// the Dockerised test DB — NOT production. See e2e/README.md before running.
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'api',
      testDir: './e2e/api',
      use: { baseURL: process.env.E2E_API_URL || 'http://localhost:3000' },
    },
    {
      name: 'ui',
      testDir: './e2e',
      testIgnore: '**/api/**',
      use: {
        browserName: 'chromium',
        baseURL: process.env.E2E_APP_URL || 'http://localhost:3001',
      },
    },
  ],
});

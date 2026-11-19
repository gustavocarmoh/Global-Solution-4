import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // Barras de rolagem de verdade (como no Windows/Linux de desktop), não as invisíveis do modo headless:
    // é com elas que o layout "pula" quando uma página é curta e outra é longa.
    launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Sobe apenas o front. A API e o banco precisam estar no ar (veja o README, seção de testes).
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

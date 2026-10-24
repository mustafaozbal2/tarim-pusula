import { defineConfig } from '@playwright/test';

const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 8111);
const PANEL_PORT = Number(process.env['E2E_PANEL_PORT'] ?? 8112);

/**
 * Tarayıcı: yerel makinede kurulu Microsoft Edge/Chrome kullanılır (indirme gerekmez);
 * CI'da `npx playwright install chromium` sonrası paketli Chromium.
 */
const channel = process.env['E2E_CHANNEL'] ?? (process.env['CI'] ? undefined : 'msedge');

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    channel,
    viewport: { width: 390, height: 844 },
    locale: 'tr-TR',
    screenshot: 'only-on-failure',
    trace: 'off',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: [
    {
      command: 'pnpm exec tsx server.ts',
      url: `http://127.0.0.1:${WEB_PORT}/__e2e/health`,
      reuseExistingServer: !process.env['CI'],
      // verify'da API/mobil/panel testleri aynı anda koşar; süreç içi Postgres'in açılışı yük altında yavaşlar.
      timeout: 300_000,
      stdout: 'pipe',
    },
    {
      // Panel: önce üretim derlemesi (ilk çalıştırmada uzun sürebilir), sonra `next start`.
      command: 'pnpm exec tsx panel-server.ts',
      url: `http://127.0.0.1:${PANEL_PORT}/giris`,
      reuseExistingServer: !process.env['CI'],
      timeout: 300_000,
      stdout: 'pipe',
    },
  ],
});

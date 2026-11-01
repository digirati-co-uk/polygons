import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testIgnore: process.env.IIIF_LIVE ? [] : ['**/iiif.spec.ts'],
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:6006', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    {
      name: 'portrait-touch',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: 'pnpm storybook --ci',
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});

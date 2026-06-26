const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:8080',
    headless: false,
    screenshot: 'on',
    video: 'off',
    viewport: { width: 1280, height: 800 },
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'reports' }]],
  outputDir: 'test-results',
});

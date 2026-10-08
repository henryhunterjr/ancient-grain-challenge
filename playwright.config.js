const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: 'quiz-handoff.spec.js', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4178', browserName: 'chromium', channel: 'chrome', viewport: { width: 393, height: 852 } },
  webServer: { command: '"C:/Program Files/nodejs/node.exe" tests/serve-preview.js', url: 'http://127.0.0.1:4178', reuseExistingServer: true },
  reporter: [['list']],
});

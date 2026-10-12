const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: ['quiz-handoff.spec.js','entry-code.spec.js'], workers: 1,
  use: { baseURL: 'http://127.0.0.1:4193', browserName: 'chromium', channel: 'chrome', viewport: { width: 393, height: 852 } },
  webServer: { command: '"C:/Program Files/nodejs/node.exe" tests/serve-preview.js', env: {AGC_PREVIEW_PORT:'4193'}, url: 'http://127.0.0.1:4193', reuseExistingServer: false },
  reporter: [['list']],
});

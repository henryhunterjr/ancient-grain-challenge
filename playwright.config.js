const { defineConfig } = require('@playwright/test');
const port = process.env.AGC_PREVIEW_PORT || '4193';
module.exports = defineConfig({
  testDir: './tests', testMatch: ['quiz-handoff.spec.js','entry-code.spec.js','winners-desk.spec.js','public-quiz.spec.js','email-signin.spec.js','bonus-quizzes.spec.js'], workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', channel: 'chrome', viewport: { width: 393, height: 852 } },
  webServer: { command: '"C:/Program Files/nodejs/node.exe" tests/serve-preview.js', env: {AGC_PREVIEW_PORT:port}, url: `http://127.0.0.1:${port}`, reuseExistingServer: false },
  reporter: [['list']],
});

import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'test/integration/suite/**/*.test.ts',
  workspaceFolder: './test/fixtures/workspace',
  mocha: { timeout: 10000 },
});

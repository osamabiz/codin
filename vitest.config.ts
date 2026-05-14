import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      // Replace the vscode module with a hand-written mock so unit tests
      // run in plain Node without an Extension Host.
      vscode: fileURLToPath(new URL('./test/__mocks__/vscode.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/test/integration/**',
      '**/test/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});

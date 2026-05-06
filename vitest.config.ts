import { defineConfig } from 'vitest/config';

/**
 * Root vitest config — applies to packages without their own config.
 * Per-app configs live alongside their package.json.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', '**/src-tauri/target/**'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['**/dist/**', '**/*.test.ts', '**/*.config.ts'],
    },
  },
});

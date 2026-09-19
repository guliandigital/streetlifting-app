import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The app tests generate an RSA signing key per suite. On a loaded CI
    // runner (turbo runs every package's tests in parallel) that exceeds the
    // 5 s default, so allow head-room instead of flaking.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});

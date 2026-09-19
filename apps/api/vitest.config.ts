import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Turbo runs every package's suite in parallel; on a loaded CI runner the
    // Fastify inject tests occasionally exceed the 5 s default.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});

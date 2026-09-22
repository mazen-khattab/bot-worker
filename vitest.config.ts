import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    // Excluded from the default run: launches a real browser and is meant
    // to be triggered explicitly/in a scheduled CI job, not on every `npm test`.
    exclude: ['**/node_modules/**', 'src/tests/**/*.smoke.test.ts'],
    setupFiles: ['./src/tests/setupEnv.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.smoke.test.ts'],
    setupFiles: ['./src/tests/setupEnv.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { assetsDir: 'bundle', target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], globals: true },
});

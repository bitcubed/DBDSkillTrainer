import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built dist/ works from any static host or file path.
  base: './',
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/analytics/**'],
    },
  },
});

import { defineConfig } from 'vite';

// BASE_PATH is set to "/paradise-isle/" by CI when deploying to GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as never);

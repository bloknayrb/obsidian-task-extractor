import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      'obsidian': path.resolve(__dirname, './test/mocks/obsidian.ts')
    }
  },
  css: {
    modules: false
  }
});
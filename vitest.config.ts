import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      'obsidian': path.resolve(__dirname, './test/mocks/obsidian.ts')
    }
  }
});
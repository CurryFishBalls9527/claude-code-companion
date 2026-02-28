import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    workspace: './vitest.workspace.ts',
  },
});

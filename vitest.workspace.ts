import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'backend',
      include: ['src/backend/**/*.test.ts', 'src/shared/**/*.test.ts'],
      environment: 'node',
      globals: true,
    },
    resolve: {
      alias: {
        $shared: '/Users/myu/code/claude-dashboard/src/shared',
      },
    },
  },
  {
    plugins: [(await import('@sveltejs/vite-plugin-svelte')).svelte()],
    test: {
      name: 'frontend',
      include: ['src/lib/**/*.test.ts', 'src/lib/**/*.test.svelte.ts', 'src/routes/**/*.test.ts'],
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['src/test-setup.ts'],
    },
    resolve: {
      alias: {
        $lib: '/Users/myu/code/claude-dashboard/src/lib',
        $shared: '/Users/myu/code/claude-dashboard/src/shared',
        '$app/stores': '/Users/myu/code/claude-dashboard/src/test-mocks/app-stores.ts',
        '$app/navigation': '/Users/myu/code/claude-dashboard/src/test-mocks/app-navigation.ts',
      },
    },
  },
]);

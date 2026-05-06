import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/extension.ts'],
    },
    // Use fork-based pooling so the VS Code debugger can attach to child processes.
    pool: 'forks',
    // Enable source maps so breakpoints bind to .ts files instead of compiled output.
    sourcemap: true,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    },
  },
});

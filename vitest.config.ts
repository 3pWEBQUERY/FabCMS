import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/nova_test',
      LOCAL_STORAGE_DIR: '.data/test-uploads',
      NOVA_SETUP_CODE: '111-222',
      APP_SECRET: 'test-secret',
    },
  },
});

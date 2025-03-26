import { defineConfig } from 'vitest/config';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  test: {
    // Basic test configuration
    include: ['e2e/**/*.e2e.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',

    // Equivalent to Jest's testTimeout
    testTimeout: 35000,

    // For handling the server setup/teardown
    globalSetup: './e2e/globalTestSetup.ts',
    setupFiles: ['./e2e/globalSetup.ts'],

    // Ensure graceful shutdowns
    pool: 'forks', // Use separate process for each test file
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },

    // For debugging
    logHeapUsage: true,
    onConsoleLog(log) {
      // You could filter logs here if needed
      return false; // Return false to suppress, true to show the log
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

import { startServer, stopServer, waitForServer } from './setup';
import { beforeAll, afterAll } from 'vitest';

// Keep track of the server to ensure it's always properly stopped
let serverStarted = false;

// Start server before all tests
beforeAll(async () => {
  try {
    await startServer();
    await waitForServer();
    serverStarted = true;
    console.log('Server is ready for e2e tests');
  } catch (error) {
    console.error('Failed to start server for e2e tests:', error);
    // Make sure we attempt to stop the server even if startup wasn't complete
    await stopServer();
    throw error;
  }
}, 30000); // 30 second timeout

// Stop server after all tests
afterAll(async () => {
  try {
    await stopServer();
    console.log('Server has been shut down');
  } catch (error) {
    console.error('Error shutting down server:', error);
    // Don't throw error here to avoid masking test failures
  }
});

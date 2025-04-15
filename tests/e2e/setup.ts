import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getTestPort } from './testUtils';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Set test specific environment variables
process.env.NODE_ENV = 'test';

let server: ChildProcess | null = null;
let serverProcess: ChildProcess | null = null;

/**
 * Start the API server for testing
 */
export async function startServer(): Promise<ChildProcess> {
  // Get the test port that was set up in globalTestSetup
  const testPort = getTestPort();
  process.env.PORT = testPort.toString();

  return new Promise((resolve, reject) => {
    const serverPath = path.resolve(__dirname, '../src/index.ts');

    // Start the server process with the assigned port
    serverProcess = spawn('ts-node', [serverPath], {
      env: { ...process.env, APP_SERVICE_PORT: process.env.PORT },
      stdio: 'pipe',
    });

    // Store server process for later cleanup
    server = serverProcess;

    let output = '';
    let startupTimeout: NodeJS.Timeout | null = null;
    let checkReadyTimeout: NodeJS.Timeout | null = null;

    // Handle cleanup when resolved or rejected
    const cleanup = () => {
      if (startupTimeout) clearTimeout(startupTimeout);
      if (checkReadyTimeout) clearTimeout(checkReadyTimeout);
    };

    // Create modified versions of resolve/reject that clean up timers
    const safeResolve = (value: ChildProcess) => {
      cleanup();
      resolve(value);
    };

    const safeReject = (err: Error) => {
      cleanup();
      reject(err);
    };

    // Collect output to know when server is ready
    if (serverProcess.stdout) {
      serverProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`[Server] ${data.toString().trim()}`);

        // When we see this message, workers are being created which means the server is almost ready
        if (data.toString().includes('listening on port')) {
          // Give it a moment to fully initialize all components
          checkReadyTimeout = setTimeout(() => {
            checkServerReady(safeResolve, safeReject);
          }, 1000);
        }
      });
    }

    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        console.error(`[Server Error] ${data.toString().trim()}`);
        output += data.toString();
      });
    }

    // Handle server process termination
    serverProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Server process exited with code ${code}`);
        console.error(`Output: ${output}`);
        safeReject(new Error(`Server process exited with code ${code}`));
      }
    });

    serverProcess.on('error', (err) => {
      console.error('Server process error:', err);
      safeReject(err);
    });

    // Handle server startup timeout
    startupTimeout = setTimeout(() => {
      if (!output.includes('listening on port')) {
        if (serverProcess) serverProcess.kill();
        safeReject(new Error('Server startup timed out'));
      }
    }, 10000); // 10 second timeout
  });
}

/**
 * Periodically check if the server is responding until it succeeds
 */
async function checkServerReady(
  resolve: (value: ChildProcess) => void,
  reject: (reason: Error) => void,
  attempts = 0
): Promise<void> {
  try {
    const response = await axios.get(`http://localhost:${getTestPort()}/status`);
    if (response.status === 200) {
      console.log('[Server] Server is ready');
      if (server) resolve(server);
      else reject(new Error('Server not available'));
    } else {
      throw new Error(`Unexpected status: ${response.status}`);
    }
  } catch (error) {
    if (attempts < 10) {
      console.log(`[Server] Waiting for server to be ready... (attempt ${attempts + 1})`);
      // Use a non-recursive approach to avoid lingering timers
      const nextAttempt = setTimeout(() => {
        clearTimeout(nextAttempt); // Ensure the timer is cleared
        checkServerReady(resolve, reject, attempts + 1);
      }, 500);
    } else {
      reject(new Error('Server failed to start within the expected time'));
    }
  }
}

/**
 * Stop the API server
 */
export async function stopServer(): Promise<void> {
  if (server) {
    return new Promise((resolve) => {
      // Set a timeout for force kill
      const forceKillTimeout = setTimeout(() => {
        console.log('[Server] Force killing server process');
        try {
          if (server) server.kill('SIGKILL');
        } catch (err) {
          console.error('[Server] Error during force kill:', err);
        }
        server = null;
        resolve();
      }, 5000);

      // Try graceful shutdown first
      server.on('close', () => {
        clearTimeout(forceKillTimeout);
        console.log('[Server] Server process closed gracefully');
        server = null;
        resolve();
      });

      // Handle immediate errors
      server.on('error', (err) => {
        console.error('[Server] Error during server shutdown:', err);
        clearTimeout(forceKillTimeout);
        try {
          if (server) server.kill('SIGKILL');
        } catch (killErr) {
          console.error('[Server] Error during kill after error:', killErr);
        }
        server = null;
        resolve();
      });

      // Try graceful shutdown
      try {
        server.kill();
      } catch (err) {
        console.error('[Server] Error sending kill signal:', err);
        clearTimeout(forceKillTimeout);
        server = null;
        resolve();
      }
    });
  }
  return Promise.resolve();
}

/**
 * Check if the server is responding
 */
export async function isServerReady(): Promise<boolean> {
  try {
    const response = await axios.get(`http://localhost:${getTestPort()}/status`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for the server to be ready
 */
export async function waitForServer(maxRetries = 20, delay = 500): Promise<boolean> {
  let retries = 0;

  while (retries < maxRetries) {
    const ready = await isServerReady();
    if (ready) {
      console.log('[Test] Server is ready and responding to requests');
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    retries++;
  }

  throw new Error('Server failed to start within the expected time');
}

/**
 * Utility functions for e2e tests
 */

import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';

// This file will store the dynamic port for tests
const PORT_FILE = path.join(__dirname, '.test-port');

/**
 * Find an available port to use for the test server
 */
export async function getRandomPort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port.port));
    });
  });
}

/**
 * Get the test port from the file or environment
 */
export function getTestPort(): number {
  // Try to read from file first
  if (fs.existsSync(PORT_FILE)) {
    const port = parseInt(fs.readFileSync(PORT_FILE, 'utf-8').trim(), 10);
    if (!isNaN(port)) {
      return port;
    }
  }

  // Fall back to environment variable
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (!isNaN(port)) {
      return port;
    }
  }

  // Default port as last resort
  return 8088;
}

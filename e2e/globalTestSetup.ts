/**
 * This file runs once before any test suite is executed.
 * It sets up the global test environment and returns a teardown function
 * that will run once after all tests are complete.
 */

import { getRandomPort } from './testUtils';
import * as path from 'path';
import * as fs from 'fs';

// This file will store the dynamic port for tests
const PORT_FILE = path.join(__dirname, '.test-port');

export async function setup() {
  console.log('Setting up global test environment');

  // Generate a random port for the entire test suite
  const port = await getRandomPort();

  // Store the port so it can be accessed by all tests
  fs.writeFileSync(PORT_FILE, port.toString());

  console.log(`Using test port: ${port}`);

  // Set environment variables
  process.env.PORT = port.toString();
  process.env.NODE_ENV = 'test';
}

export async function teardown() {
  console.log('Tearing down global test environment');

  // Clean up the port file
  if (fs.existsSync(PORT_FILE)) {
    fs.unlinkSync(PORT_FILE);
  }
}

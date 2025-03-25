import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { IAppService } from '../../core';
import { useGridPlusProvider } from '../GridPlusProvider';
import express from 'express';
import { Application } from 'express';
import request from 'supertest';
import { Client, Utils } from 'gridplus-sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as WebSocket from 'ws';
import { createServer } from 'http';
import {
  type Address,
  getAddress,
  numberToHex,
  parseEther,
  parseGwei,
  recoverAddress,
  stringToHex,
  verifyTypedData,
} from 'viem';
import { ProviderRpcError } from '../handlers/types';

// Load environment variables from .env.test file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.test') });

const {
  GRIDPLUS_CONNECT_URL,
  EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS = '',
  ANVIL_RPC_URL,
  ANVIL_CHAIN_ID = '31337',
} = process.env;

if (!EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS) {
  throw new Error('EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS is required');
}

const RECEIVER_ADDRESS: Address = '0x6f85Eb534E14D605d4e82bF97ddF59c18F686699';
const EXPECTED_ADDRESS_DEFAULT_BALANCE_ETH = '100'; // ETH

describe('GridPlusProvider Integration Tests', () => {
  let app: Application;
  let server: any;
  let logger: any;
  let provider: ReturnType<typeof useGridPlusProvider>;
  const DEVICE_ID = 'sc6J1U';
  const APP_NAME = 'SDK Test2';
  const APP_PASSWORD = 'asdfasdf';
  let authToken = '';
  let ws: WebSocket;
  let wsEvents: { event: string; data: any }[] = [];

  // Helper function to make authenticated requests
  const makeRequest = (method: string, deviceId: string, body: any) => {
    const req = request(app)
      .post(`/api/v2/www${deviceId ? `/${deviceId}` : ''}`)
      .send(body);

    if (authToken) {
      req.set('Authorization', `Bearer ${authToken}`);
    }

    return req;
  };

  beforeAll(() => {
    // Ensure required environment variables are set
    const requiredEnvVars = [
      'GRIDPLUS_CONNECT_URL',
      'MQTT_HOST',
      'MQTT_HTTP_PORT',
      'ADMIN_CLIENT_HOST',
      'ADMIN_CLIENT_USER',
      'ADMIN_CLIENT_PASS',
      'EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS',
      'ANVIL_RPC_URL',
      'ANVIL_CHAIN_ID',
    ];

    const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
    if (missingVars.length > 0) {
      console.error('Missing environment variables:', missingVars);
      console.error('Current environment:', process.env);
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  });

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    // Create HTTP server
    server = createServer(app);
    (app as any).server = server;

    logger = {
      info: console.log,
      error: console.error,
    };

    const service: IAppService = {
      app: app as any as IAppService['app'],
      logger,
    };

    provider = useGridPlusProvider(service);
    app.post('/api/v2/www/:deviceId', provider.requestHandler);

    // Start the server
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        console.log(`Test server listening on port ${(server.address() as any).port}`);
        resolve();
      });
    });

    // Initialize connection and get auth token
    const response = await request(app).post(`/api/v2/www`).send({
      deviceId: DEVICE_ID,
      name: APP_NAME,
      password: APP_PASSWORD,
    });

    expect(response.status).toBe(200);
    authToken = response.body.token;

    // Clear WebSocket events array
    wsEvents = [];
  }, 60000);

  afterEach(() => {
    // Clean up resources
    server.close();
  });

  it('should handle requests', async () => {
    // Implementation of the test
  });

  it('should handle WebSocket events', async () => {
    // Implementation of the test
  });

  it('should handle errors', async () => {
    // Implementation of the test
  });
});

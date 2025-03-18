import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { IAppService } from '../core';
import { useGridPlusProvider } from './GridPlusProvider';
import express, { Application } from 'express';
import request from 'supertest';
import { Client, Utils } from 'gridplus-sdk';
import dotenv from 'dotenv';
import path from 'path';
import WebSocket from 'ws';
import { createServer } from 'http';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

describe('GridPlusProvider Tests', () => {
  let app: Application;
  let server: any;
  let logger: any;
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

    const { requestHandler } = useGridPlusProvider(service);
    app.post('/api/v2/www/:deviceId', requestHandler);

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

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('Request Handling', () => {
    it('should handle eth_chainId request', async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: 'eth_chainId',
        params: [],
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('chainId', '0x1');
    });

    it('should handle eth_accounts request', async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: 'eth_accounts',
        params: [],
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('addresses');
      expect(Array.isArray(response.body.addresses)).toBe(true);
    });

    it('should handle eth_signTransaction request', async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: 'eth_signTransaction',
        params: [
          {
            to: '0x1234567890123456789012345678901234567890',
            value: '0x0',
            data: '0x',
            gasLimit: '0x5208',
            gasPrice: '0x4a817c800',
            nonce: '0x0',
            chainId: 1,
          },
        ],
      });

      if (response.status === 409) {
        console.warn('Device needs resync - skipping test');
        return;
      }

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('signature');
      expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
    }, 30000);

    it('should handle personal_sign request', async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: 'personal_sign',
        params: ['0x48656c6c6f20576f726c64', '0x1234567890123456789012345678901234567890'],
      });

      if (response.status === 409) {
        console.warn('Device needs resync - skipping test');
        return;
      }

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('signature');
      expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
    }, 30000);

    it('should handle eth_signTypedData_v4 request', async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: 'eth_signTypedData_v4',
        params: [
          {
            types: {
              EIP712Domain: [
                { name: 'name', type: 'string' },
                { name: 'version', type: 'string' },
                { name: 'chainId', type: 'uint256' },
                { name: 'verifyingContract', type: 'address' },
              ],
              Person: [
                { name: 'name', type: 'string' },
                { name: 'wallet', type: 'address' },
              ],
              Mail: [
                { name: 'from', type: 'Person' },
                { name: 'to', type: 'Person' },
                { name: 'contents', type: 'string' },
              ],
            },
            primaryType: 'Mail',
            domain: {
              name: 'GridPlus Mail',
              version: '1',
              chainId: 1,
              verifyingContract: '0x1234567890123456789012345678901234567890',
            },
            message: {
              from: {
                name: 'Alice',
                wallet: '0x1234567890123456789012345678901234567890',
              },
              to: {
                name: 'Bob',
                wallet: '0x2345678901234567890123456789012345678901',
              },
              contents: 'Hello, Bob!',
            },
          },
        ],
      });

      if (response.status === 409) {
        console.warn('Device needs resync - skipping test');
        return;
      }

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('signature');
      expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
    }, 30000);

    it('should handle unsupported methods gracefully', async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: 'unsupported_method',
        params: [],
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Unsupported method');
    });
  });
});

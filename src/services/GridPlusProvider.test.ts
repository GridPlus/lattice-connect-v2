import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { IAppService } from '../core';
import { useGridPlusProvider } from './GridPlusProvider';
import express, { Application } from 'express';
import request from 'supertest';
import { Client, Utils } from 'gridplus-sdk';
import dotenv from 'dotenv';
import path from 'path';
import WebSocket from 'ws';
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
import { ProviderRpcError } from './handlers/types';

// Load environment variables from .env.test file
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test') });

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

describe('GridPlusProvider Tests', () => {
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

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('Connectivity Logic', () => {
    it('should emit connected when successfully connected', async () => {
      const onConnected = jest.fn();
      provider.emitter.on('connect', (connectionInfo: { chainId: string }) => {
        expect(connectionInfo.chainId).toBe('0x1');
        onConnected();
      });

      const response = await makeRequest('', DEVICE_ID, {
        method: 'eth_chainId',
        params: [],
      });

      expect(response.status).toBe(200);
      expect(onConnected).toHaveBeenCalled();
    });

    it('should emit disconnected when connectivity is lost', async () => {
      const onDisconnected = jest.fn();
      provider.emitter.on('disconnect', (error: ProviderRpcError) => {
        expect(error.code).toBe(4900);
        onDisconnected();
      });

      // Simulate a connection error
      const response = await makeRequest('', DEVICE_ID, {
        method: 'eth_signTransaction',
        params: [{ invalid: 'params' }],
      });

      expect(response.status).toBe(500);
      expect(onDisconnected).toHaveBeenCalled();
    });
  });

  describe('Request Handling', () => {
    describe('eth_requestAccounts', () => {
      it('should request accounts associated with the wallet', async () => {
        const response = await makeRequest('', DEVICE_ID, {
          method: 'eth_requestAccounts',
          params: [],
        });

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.addresses)).toBeTruthy();
        expect(response.body.addresses).toHaveLength(1);
        expect(response.body.addresses[0]).toBe(EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS);
      });
    });

    describe('eth_sign', () => {
      it('should sign a message', async () => {
        const messageDigest = stringToHex('A man, a plan, a canal, Panama');
        const signerAddress = EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS;

        const response = await makeRequest('', DEVICE_ID, {
          method: 'eth_sign',
          params: [signerAddress, messageDigest],
        });

        expect(response.status).toBe(200);
        expect(response.body.signature).toBeDefined();
        expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);

        const address = await recoverAddress({
          hash: messageDigest,
          signature: response.body.signature,
        });

        expect(getAddress(address)).toBe(getAddress(signerAddress));
      });
    });

    describe('eth_signTypedData_v4', () => {
      it('should sign typed data according to EIP-712', async () => {
        const domain = {
          name: 'Ether Mail',
          version: '1',
          chainId: 1,
          verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
        } as const;

        const types = {
          Person: [
            { name: 'name', type: 'string' },
            { name: 'wallet', type: 'address' },
          ],
          Mail: [
            { name: 'from', type: 'Person' },
            { name: 'to', type: 'Person' },
            { name: 'contents', type: 'string' },
          ],
        } as const;

        const message = {
          from: {
            name: 'Cow',
            wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
          },
          to: {
            name: 'Bob',
            wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
          },
          contents: 'Hello, Bob!',
        } as const;

        const typedData = {
          domain,
          types,
          primaryType: 'Mail' as const,
          message,
        };

        const response = await makeRequest('', DEVICE_ID, {
          method: 'eth_signTypedData_v4',
          params: [EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS, typedData],
        });

        expect(response.status).toBe(200);
        expect(response.body.signature).toBeDefined();
        expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);

        const valid = await verifyTypedData({
          address: EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS as Address,
          domain,
          types,
          primaryType: 'Mail',
          message,
          signature: response.body.signature,
        });

        expect(valid).toBeTruthy();
      });
    });

    describe('eth_signTransaction', () => {
      it('should sign a transaction', async () => {
        const response = await makeRequest('', DEVICE_ID, {
          method: 'eth_signTransaction',
          params: [
            {
              from: EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS,
              to: RECEIVER_ADDRESS,
              value: numberToHex(parseEther('0.001')),
              chainId: numberToHex(parseInt(ANVIL_CHAIN_ID ?? '31337')),
              nonce: numberToHex(0),
              gas: numberToHex(21000),
              maxFeePerGas: numberToHex(parseGwei('20')),
              maxPriorityFeePerGas: numberToHex(parseGwei('2')),
              type: '0x2',
            },
          ],
        });

        expect(response.status).toBe(200);
        expect(response.body.signature).toBeDefined();
        expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
      });
    });
  });
});

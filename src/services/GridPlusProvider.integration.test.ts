import {
  type Address,
  type Quantity,
  type Index,
  type TransactionRequestEIP1559,
  getAddress,
  numberToHex,
  parseEther,
  parseGwei,
  recoverAddress,
  stringToHex,
  verifyTypedData,
  type EIP1474Methods,
  ProviderDisconnectedError,
  MethodNotSupportedRpcError,
} from 'viem';
import { foundry } from 'viem/chains';
import { Client } from 'gridplus-sdk';
import { useGridPlusProvider } from './GridPlusProvider';
import { IAppService } from '../core';
import express, { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { formatEther, getHttpRpcClient } from 'viem/utils';

const RECEIVER_ADDRESS: Address = '0x6f85Eb534E14D605d4e82bF97ddF59c18F686699';
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545';
const EXPECTED_ADDRESS_DEFAULT_BALANCE_ETH = '100'; // ETH
const anvilPublicClient = getHttpRpcClient(ANVIL_RPC_URL);

const anvil = {
  /**
   * Sets the balance of an address on the anvil test net
   * @param address - the target address to set the balance; default EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS
   * @param balance (ETH) - the balance to set in ETH; default 100ETH
   */
  async setBalance(
    address: Address,
    balance: string = EXPECTED_ADDRESS_DEFAULT_BALANCE_ETH,
  ) {
    await anvilPublicClient.request({
      body: {
        method: 'hardhat_setBalance',
        params: [address, numberToHex(parseEther(balance))],
        id: 0,
      },
    });
  },
  /**
   * Resets the `address` nonce to 0
   * @param address - the address to reset
   */
  async resetNonce(address: Address) {
    await anvilPublicClient.request({
      body: {
        method: 'hardhat_setNonce',
        params: [address, '0x0'],
        id: 0,
      },
    });
  },
  /**
   * Reset the fork to its initial state
   */
  async reset() {
    await anvilPublicClient.request({
      body: {
        method: 'anvil_reset',
        params: [],
        id: 0,
      },
    });
  },
};

describe('GridPlus Provider Integration Tests', () => {
  let mockClient: jest.Mocked<Client>;
  let mockAppService: IAppService;
  let provider: ReturnType<typeof useGridPlusProvider>;
  let mockNext: jest.Mock;
  let deviceEmitter: EventEmitter;

  beforeAll(async () => {
    // Reset Anvil to initial state
    await anvil.reset();
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    mockNext = jest.fn();
    deviceEmitter = new EventEmitter();

    // Create mock app service
    mockAppService = {
      app: express(),
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
    };

    // Mock Client with more complete implementation
    const mockClientBase = {
      sign: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      getAddresses: jest.fn(),
      getStateData: jest.fn().mockReturnValue({}),
      pair: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
    };

    mockClient = mockClientBase as unknown as jest.Mocked<Client>;

    // Initialize provider
    provider = useGridPlusProvider(mockAppService);

    // Mock the deviceEmitters Map in the provider
    (provider as any).deviceEmitters = new Map([
      [process.env.TEST_DEVICE_ID || 'test-device', deviceEmitter],
    ]);
  });

  afterEach(async () => {
    // Clean up after each test
    deviceEmitter.removeAllListeners();
    await anvil.reset();
  });

  describe('Connectivity Logic', () => {
    it('should emit connected when successfully connected', async () => {
      const onConnected = jest.fn();
      deviceEmitter.on('connect', onConnected);

      // Simulate successful connection
      await provider.connectHandler(
        {
          body: {
            deviceId: process.env.TEST_DEVICE_ID || 'test-device',
            name: process.env.TEST_DEVICE_NAME || 'Test Device',
          },
        } as Request,
        {
          json: jest.fn(),
          status: jest.fn().mockReturnThis(),
        } as unknown as Response,
        mockNext
      );

      expect(onConnected).toHaveBeenCalled();
      expect(onConnected).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: expect.any(String),
        })
      );
    });

    it('should emit disconnected when connectivity is lost', async () => {
      const onDisconnected = jest.fn();
      deviceEmitter.on('disconnect', (error) => {
        expect(error).toBeInstanceOf(ProviderDisconnectedError);
        onDisconnected();
      });

      // Mock client to simulate disconnection
      mockClient.isConnected.mockReturnValue(false);

      // Simulate connection loss
      await provider.requestHandler(
        {
          params: { deviceId: process.env.TEST_DEVICE_ID || 'test-device' },
          body: { method: 'eth_blockNumber' },
          deviceStateData: {
            clientData: {},
            chainConfig: { chainId: '0x1' },
            connectedAccounts: [],
            permissions: [],
            pendingCalls: new Map(),
            capabilities: [],
          },
        } as unknown as Request,
        {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        } as unknown as Response,
        mockNext
      );

      expect(onDisconnected).toHaveBeenCalledTimes(1);
    });
  });

  describe('EIP-1193 Provider Methods', () => {
    describe('Supported Methods', () => {
      describe('eth_requestAccounts', () => {
        it('should request accounts associated with the wallet', async () => {
          const mockAddresses = [process.env.EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS || '0x1234567890123456789012345678901234567890'];
          mockClient.getAddresses.mockResolvedValue(mockAddresses);

          const mockJsonResponse = jest.fn();
          await provider.requestHandler(
            {
              params: { deviceId: process.env.TEST_DEVICE_ID || 'test-device' },
              body: { method: 'eth_requestAccounts' },
              deviceStateData: {
                clientData: {},
                chainConfig: { chainId: numberToHex(foundry.id) },
                connectedAccounts: [],
                permissions: [],
                pendingCalls: new Map(),
                capabilities: [],
              },
              gridplusClient: mockClient,
            } as unknown as Request,
            {
              json: mockJsonResponse,
              status: jest.fn().mockReturnThis(),
            } as unknown as Response,
            mockNext
          );

          expect(mockJsonResponse).toHaveBeenCalledWith({
            addresses: mockAddresses,
          });
        });
      });

      describe('eth_signTransaction', () => {
        it('should sign a transaction', async () => {
          const mockSignature = {
            sig: {
              r: Buffer.from('1234', 'hex'),
              s: Buffer.from('5678', 'hex'),
              v: Buffer.from('01', 'hex'),
            },
          };

          mockClient.sign.mockResolvedValue(mockSignature);

          const transaction = {
            from: process.env.EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS as Address || '0x1234567890123456789012345678901234567890',
            to: RECEIVER_ADDRESS,
            value: numberToHex(parseEther('0.001')),
            nonce: numberToHex(0),
            gas: numberToHex(21000),
            maxFeePerGas: numberToHex(parseGwei('20')),
            maxPriorityFeePerGas: numberToHex(parseGwei('2')),
            type: '0x2',
          };

          const mockJsonResponse = jest.fn();
          await provider.requestHandler(
            {
              params: { deviceId: process.env.TEST_DEVICE_ID || 'test-device' },
              body: {
                method: 'eth_signTransaction',
                params: [transaction],
              },
              deviceStateData: {
                clientData: {},
                chainConfig: { chainId: numberToHex(foundry.id) },
                connectedAccounts: [transaction.from],
                permissions: [],
                pendingCalls: new Map(),
                capabilities: [],
              },
              gridplusClient: mockClient,
            } as unknown as Request,
            {
              json: mockJsonResponse,
              status: jest.fn().mockReturnThis(),
            } as unknown as Response,
            mockNext
          );

          expect(mockJsonResponse).toHaveBeenCalledWith(
            expect.objectContaining({
              signature: expect.stringMatching(/^0x[0-9a-f]+$/i),
            })
          );
          expect(mockClient.sign).toHaveBeenCalled();
        });
      });
    });

    describe('Unsupported Methods', () => {
      const unsupportedMethods = [
        'wallet_getPermissions',
        'wallet_requestPermissions',
        'wallet_revokePermissions',
        'wallet_registerOnboarding',
        'wallet_watchAsset',
        'wallet_scanQRCode',
        'wallet_getSnaps',
        'wallet_requestSnaps',
        'wallet_snap',
        'wallet_invokeSnap',
        'eth_decrypt',
        'eth_getEncryptionPublicKey',
      ];

      unsupportedMethods.forEach((method) => {
        it(`should throw a Method not supported error for ${method}`, async () => {
          const mockJsonResponse = jest.fn();
          await provider.requestHandler(
            {
              params: { deviceId: process.env.TEST_DEVICE_ID || 'test-device' },
              body: { method: method as EIP1474Methods[0]['Method'] },
              deviceStateData: {
                clientData: {},
                chainConfig: { chainId: numberToHex(foundry.id) },
                connectedAccounts: [],
                permissions: [],
                pendingCalls: new Map(),
                capabilities: [],
              },
              gridplusClient: mockClient,
            } as unknown as Request,
            {
              json: mockJsonResponse,
              status: jest.fn().mockReturnThis(),
            } as unknown as Response,
            mockNext
          );

          expect(mockJsonResponse).toHaveBeenCalledWith(
            expect.objectContaining({
              error: expect.stringContaining('Method not supported'),
            })
          );
        });
      });
    });
  });
}); 
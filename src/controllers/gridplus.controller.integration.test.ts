import { type Address, numberToHex } from 'viem';
import { foundry } from 'viem/chains';
import { Client } from 'gridplus-sdk';
import * as gridplusController from './gridplus.controller';
import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { StateData } from '../services/handlers/types';

// Mock anvil functions (we're not actually using anvil in tests)
const mockAnvil = {
  setBalance: jest.fn(),
  resetNonce: jest.fn(),
  reset: jest.fn(),
};

describe('GridPlus Provider Integration Tests', () => {
  let mockClient: jest.Mocked<Client>;
  let mockNext: jest.Mock;
  let deviceEmitter: EventEmitter;
  const TEST_DEVICE_ID = process.env.TEST_DEVICE_ID || 'test-device';

  beforeAll(async () => {
    // Reset anvil (mocked)
    await mockAnvil.reset();
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    mockNext = jest.fn();

    // Get the device emitter
    deviceEmitter = gridplusController.getDeviceEmitter(TEST_DEVICE_ID);

    // Mock Client with more complete implementation
    const mockClientBase = {
      _connectionStatus: true,
      getConnectionStatus: jest.fn().mockReturnValue(true),
      setConnectionStatus: jest.fn(),
      sign: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      getAddresses: jest.fn(),
      getStateData: jest.fn().mockReturnValue({}),
      pair: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };

    mockClient = mockClientBase as unknown as jest.Mocked<Client>;
  });

  afterEach(async () => {
    // Clean up after each test
    if (deviceEmitter) {
      deviceEmitter.removeAllListeners();
    }
    await mockAnvil.reset();
  });

  describe('Connectivity Logic', () => {
    it('should emit connected when successfully connected', async () => {
      const onConnected = jest.fn();
      deviceEmitter.on('connect', onConnected);

      // Create mock request and response
      const mockReq = {
        body: {
          deviceId: TEST_DEVICE_ID,
          name: process.env.TEST_DEVICE_NAME || 'Test Device',
        },
      } as Request;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as Response;

      // Mock implementations for connect flow
      mockClient.getAddresses.mockResolvedValue(['0x1234567890123456789012345678901234567890']);
      jest.spyOn(gridplusController, 'generateToken').mockReturnValue('mock-token');

      // Simulate successful connection - we need to mock this since we're not using actual Client
      // @ts-ignore - we're mocking the implementation
      jest.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
      // @ts-ignore - we're mocking the implementation
      jest
        .spyOn(Client.prototype, 'getAddresses')
        .mockResolvedValue(['0x1234567890123456789012345678901234567890']);
      // @ts-ignore - we're mocking the implementation
      jest.spyOn(Client.prototype, 'getStateData').mockReturnValue('{}');

      // Call the connect method
      await gridplusController.connectDevice(mockReq, mockRes);

      expect(onConnected).toHaveBeenCalled();
      expect(onConnected.mock.calls[0][0]).toHaveProperty('chainId');
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'mock-token',
          message: 'Connection initialized successfully',
        })
      );
    });
  });

  describe('EIP-1193 Provider Methods', () => {
    describe('Supported Methods', () => {
      describe('eth_requestAccounts', () => {
        it('should request accounts associated with the wallet', async () => {
          const mockAddresses = [
            process.env.EXPECTED_WALLET_ACCOUNT_ETH_ADDRESS ||
              '0x1234567890123456789012345678901234567890',
          ];
          mockClient.getAddresses.mockResolvedValue(mockAddresses);

          // Create mock state data
          const state: StateData = {
            clientData: '{}',
            chainConfig: { chainId: numberToHex(foundry.id), name: 'Foundry Local' },
            connectedAccounts: [],
            permissions: [],
            pendingCalls: new Map(),
            capabilities: {},
          };

          // Mock token for device
          const MOCK_TOKEN = 'mock-token';

          // Setup mock request - simulate that middleware has already run
          const mockReq = {
            params: { deviceId: TEST_DEVICE_ID },
            body: { method: 'eth_requestAccounts', params: [] },
            deviceStateData: state,
            gridplusClient: mockClient,
          } as unknown as Request;

          const mockJsonResponse = jest.fn();
          const mockRes = {
            json: mockJsonResponse,
            status: jest.fn().mockReturnThis(),
          } as unknown as Response;

          // Mock deviceToTokenMap directly in the controller
          const originalMap = jest.requireActual('./gridplus.controller').deviceToTokenMap;
          // @ts-ignore - accessing private property
          gridplusController.deviceToTokenMap = new Map([[TEST_DEVICE_ID, MOCK_TOKEN]]);

          // Call the method handler directly (skipping middleware)
          await gridplusController.handleMethodRequest(mockReq, mockRes);

          // Restore the original map
          // @ts-ignore - accessing private property
          gridplusController.deviceToTokenMap = originalMap;

          expect(mockJsonResponse).toHaveBeenCalled();
          expect(mockClient.getAddresses).toHaveBeenCalled();
        });
      });
    });
  });
});

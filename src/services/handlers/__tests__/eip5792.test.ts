import { EventEmitter } from 'events';
import { Client } from 'gridplus-sdk';
import { createPublicClient } from 'viem';
import type { Address } from 'viem';
import {
  handleWalletSendCalls,
  handleWalletGetCallStatus,
  handleWalletAddEthereumChain,
} from '../eip5792';
import { StateData, STATUS_CODES, WalletPermission } from '../types';
import { handleEIP5792Request } from '../eip5792';
import { ISigningService } from '../interfaces';

jest.mock('../eip1193', () => ({
  handleEIP1193Request: jest.fn(),
}));

// Mock viem
jest.mock('viem', () => ({
  createPublicClient: jest.fn(),
  defineChain: jest.fn(),
  http: jest.fn(),
}));

describe('EIP-5792 Handlers', () => {
  let mockClient: jest.Mocked<Client>;
  let mockState: StateData;
  let mockEmitter: EventEmitter;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Client
    mockClient = {
      sign: jest.fn(),
    } as unknown as jest.Mocked<Client>;

    // Mock state
    mockState = {
      chainConfig: {
        chainId: '0x1',
        name: 'Ethereum',
        rpcUrl: 'https://eth-mainnet.example.com',
      },
      capabilities: {
        '0x1': {
          eth_signTransaction: { version: '1.0' },
        },
      },
      pendingCalls: new Map(),
      clientData: 'mock-device-state-data',
      connectedAccounts: [],
      permissions: [] as WalletPermission[],
    };

    // Mock EventEmitter
    mockEmitter = new EventEmitter();

    // Mock viem public client
    (createPublicClient as jest.Mock).mockReturnValue({
      getTransactionCount: jest.fn().mockResolvedValue(0),
      getGasPrice: jest.fn().mockResolvedValue(BigInt(20000000000)),
      estimateGas: jest.fn().mockResolvedValue(BigInt(21000)),
      sendRawTransaction: jest.fn().mockResolvedValue('0xmocktxhash' as `0x${string}`),
    });
  });

  describe('handleWalletSendCalls', () => {
    const mockCallsRequest = {
      version: '1.0',
      chainId: '0x1' as `0x${string}`,
      from: '0x1234567890123456789012345678901234567890' as Address,
      calls: [
        {
          to: '0x2345678901234567890123456789012345678901' as Address,
          data: '0x' as `0x${string}`,
          value: '0x0' as `0x${string}`,
        },
      ],
      capabilities: {
        eth_signTransaction: { version: '1.0' },
      },
    };

    it('should process valid calls request', async () => {
      mockClient.sign = jest.fn().mockResolvedValue({
        sig: {
          r: Buffer.from('1234', 'hex'),
          s: Buffer.from('5678', 'hex'),
          v: Buffer.from('01', 'hex'),
        },
      });

      const result = await handleWalletSendCalls(mockClient, [mockCallsRequest], mockState);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('capabilities');
      expect(mockState.pendingCalls.size).toBe(1);
    });

    it('should throw error for invalid parameters', async () => {
      await expect(handleWalletSendCalls(mockClient, [{}] as any, mockState)).rejects.toThrow(
        'Invalid sendCalls parameters'
      );
    });

    it('should throw error for chain mismatch', async () => {
      const invalidChainRequest = {
        ...mockCallsRequest,
        chainId: '0x2' as `0x${string}`,
      };

      await expect(
        handleWalletSendCalls(mockClient, [invalidChainRequest], mockState)
      ).rejects.toThrow('ChainId mismatch');
    });

    it('should throw error for unsupported capabilities', async () => {
      const unsupportedCapRequest = {
        ...mockCallsRequest,
        capabilities: {
          unsupported_capability: { version: '1.0', optional: false },
        },
      };

      await expect(
        handleWalletSendCalls(mockClient, [unsupportedCapRequest], mockState)
      ).rejects.toThrow('Unsupported capability: unsupported_capability');
    });
  });

  describe('handleWalletGetCallStatus', () => {
    it('should return status for valid call ID', () => {
      const mockStatus = {
        version: '1.0',
        chainId: '0x1' as `0x${string}`,
        id: '0x1234' as `0x${string}`,
        status: STATUS_CODES.PENDING,
        capabilities: {},
        receipts: [],
      };

      mockState.pendingCalls.set('0x1234', mockStatus);

      const result = handleWalletGetCallStatus(['0x1234' as `0x${string}`], mockState);

      expect(result).toEqual(mockStatus);
    });

    it('should throw error for invalid call ID', () => {
      expect(() => {
        handleWalletGetCallStatus(['0xabcd' as `0x${string}`], mockState);
      }).toThrow('Call ID not found');
    });

    it('should throw error for missing call ID', () => {
      expect(() => {
        handleWalletGetCallStatus(['0x' as `0x${string}`], mockState);
      }).toThrow('Invalid call ID');
    });
  });

  describe('handleWalletAddEthereumChain', () => {
    const mockChainParams = {
      chainId: '0x89' as `0x${string}`,
      chainName: 'Polygon',
      rpcUrls: ['https://polygon-rpc.com'],
    };

    it('should add new chain configuration', () => {
      const result = handleWalletAddEthereumChain([mockChainParams], mockState, mockEmitter);

      expect(result).toEqual({ success: true });
      expect(mockState.chainConfig).toEqual({
        chainId: mockChainParams.chainId,
        name: mockChainParams.chainName,
        rpcUrl: mockChainParams.rpcUrls[0],
      });
    });

    it('should emit chainChanged event', (done) => {
      mockEmitter.on('chainChanged', (chainId) => {
        expect(chainId).toBe(mockChainParams.chainId);
        done();
      });

      handleWalletAddEthereumChain([mockChainParams], mockState, mockEmitter);
    });

    it('should throw error for invalid chain parameters', () => {
      expect(() => {
        handleWalletAddEthereumChain([{}] as any, mockState);
      }).toThrow('Invalid chain parameters');
    });
  });
});

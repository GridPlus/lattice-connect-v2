import { Client, Constants } from 'gridplus-sdk';
import type { Address } from 'viem';
import {
  handleEthSignTransaction,
  handlePersonalSign,
  handleSignTypedData,
  ensureHexString,
} from '../eip1193';
import { EthSignTransactionParams, TypedDataParams, SignRequestParams } from '../types';
import { handleEIP1193Request } from '../eip1193';
import { ISigningService } from '../interfaces';
import { MethodParams, StateData } from '../types';

type SignData = {
  sig: {
    r: Buffer;
    s: Buffer;
    v: Buffer;
  };
};

describe('EIP-1193 Handlers', () => {
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Client with properly typed sign method
    mockClient = {
      sign: jest.fn().mockImplementation(
        async (params: SignRequestParams): Promise<SignData> => ({
          sig: {
            r: Buffer.from([]),
            s: Buffer.from([]),
            v: Buffer.from([]),
          },
        })
      ),
    } as unknown as jest.Mocked<Client>;
  });

  describe('handleEthSignTransaction', () => {
    const mockTransaction: EthSignTransactionParams = {
      to: '0x2345678901234567890123456789012345678901' as Address,
      from: '0x1234567890123456789012345678901234567890' as Address,
      nonce: '0x1' as `0x${string}`,
      gasPrice: '0x4a817c800' as `0x${string}`,
      gasLimit: '0x5208' as `0x${string}`,
      value: '0xde0b6b3a7640000' as `0x${string}`,
      data: '0x' as `0x${string}`,
      chainId: '0x1' as `0x${string}`,
    };

    it('should sign a transaction successfully', async () => {
      const mockSignature: SignData = {
        sig: {
          r: Buffer.from('1234', 'hex'),
          s: Buffer.from('5678', 'hex'),
          v: Buffer.from('01', 'hex'),
        },
      };

      mockClient.sign.mockResolvedValue(mockSignature);

      const result = await handleEthSignTransaction(mockClient, [mockTransaction]);

      expect(result).toHaveProperty('signature');
      expect(typeof result.signature).toBe('string');
      expect(result.signature).toMatch(/^0x[0-9a-f]+$/i);

      expect(mockClient.sign).toHaveBeenCalledWith({
        currency: 'ETH',
        data: expect.objectContaining({
          signerPath: expect.any(Array),
          curveType: Constants.SIGNING.CURVES.SECP256K1,
          hashType: Constants.SIGNING.HASHES.KECCAK256,
        }),
      });
    });

    it('should throw error for invalid transaction parameters', async () => {
      await expect(
        handleEthSignTransaction(mockClient, [{}] as [EthSignTransactionParams])
      ).rejects.toThrow('Invalid transaction parameters');
    });

    it('should throw error when no signature is returned', async () => {
      mockClient.sign.mockImplementation(async () => ({
        sig: {
          r: Buffer.from([]),
          s: Buffer.from([]),
          v: Buffer.from([]),
        },
      }));

      await expect(handleEthSignTransaction(mockClient, [mockTransaction])).rejects.toThrow(
        'No signature returned from device'
      );
    });
  });

  describe('handlePersonalSign', () => {
    const mockAddress = '0x1234567890123456789012345678901234567890';
    const mockMessage = '0x48656c6c6f20576f726c64'; // "Hello World" in hex

    it('should sign a message with personal_sign', async () => {
      const mockSignature: SignData = {
        sig: {
          r: Buffer.from('1234', 'hex'),
          s: Buffer.from('5678', 'hex'),
          v: Buffer.from('01', 'hex'),
        },
      };

      mockClient.sign.mockResolvedValue(mockSignature);

      const result = await handlePersonalSign(
        mockClient,
        [mockMessage, mockAddress],
        'personal_sign'
      );

      expect(result).toHaveProperty('signature');
      expect(typeof result.signature).toBe('string');
      expect(result.signature).toMatch(/^0x[0-9a-f]+$/i);

      expect(mockClient.sign).toHaveBeenCalledWith({
        currency: 'ETH_MSG',
        data: expect.objectContaining({
          signerPath: expect.any(Array),
          curveType: Constants.SIGNING.CURVES.SECP256K1,
          hashType: Constants.SIGNING.HASHES.KECCAK256,
        }),
      });
    });

    it('should sign a message with eth_sign', async () => {
      const mockSignature: SignData = {
        sig: {
          r: Buffer.from('1234', 'hex'),
          s: Buffer.from('5678', 'hex'),
          v: Buffer.from('01', 'hex'),
        },
      };

      mockClient.sign.mockResolvedValue(mockSignature);

      const result = await handlePersonalSign(mockClient, [mockAddress, mockMessage], 'eth_sign');

      expect(result).toHaveProperty('signature');
      expect(typeof result.signature).toBe('string');
      expect(result.signature).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should throw error for invalid parameters', async () => {
      await expect(
        handlePersonalSign(mockClient, ['', ''] as [string, string], 'personal_sign')
      ).rejects.toThrow('Invalid personal_sign parameters');
    });

    it('should throw error when no signature is returned', async () => {
      mockClient.sign.mockImplementation(async () => ({
        sig: {
          r: Buffer.from([]),
          s: Buffer.from([]),
          v: Buffer.from([]),
        },
      }));

      await expect(
        handlePersonalSign(mockClient, [mockMessage, mockAddress], 'personal_sign')
      ).rejects.toThrow('No signature returned from device');
    });
  });

  describe('handleSignTypedData', () => {
    const mockTypedData: TypedDataParams = {
      domain: {
        name: 'Test Domain',
        version: '1',
        chainId: 1,
        verifyingContract: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      },
      types: {
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' },
        ],
      },
      primaryType: 'Person',
      message: {
        name: 'Bob',
        wallet: '0x1234567890123456789012345678901234567890',
      },
    };

    it('should sign typed data successfully', async () => {
      const mockSignature: SignData = {
        sig: {
          r: Buffer.from('1234', 'hex'),
          s: Buffer.from('5678', 'hex'),
          v: Buffer.from('01', 'hex'),
        },
      };

      mockClient.sign.mockResolvedValue(mockSignature);

      const result = await handleSignTypedData(mockClient, [mockTypedData]);

      expect(result).toHaveProperty('signature');
      expect(typeof result.signature).toBe('string');
      expect(result.signature).toMatch(/^0x[0-9a-f]+$/i);

      expect(mockClient.sign).toHaveBeenCalledWith({
        currency: 'ETH_MSG',
        data: expect.objectContaining({
          signerPath: expect.any(Array),
          curveType: Constants.SIGNING.CURVES.SECP256K1,
          hashType: Constants.SIGNING.HASHES.KECCAK256,
        }),
      });
    });

    it('should throw error for invalid typed data parameters', async () => {
      await expect(handleSignTypedData(mockClient, [{}] as [TypedDataParams])).rejects.toThrow(
        'Invalid typed data parameters'
      );
    });

    it('should throw error when no signature is returned', async () => {
      mockClient.sign.mockImplementation(async () => ({
        sig: {
          r: Buffer.from([]),
          s: Buffer.from([]),
          v: Buffer.from([]),
        },
      }));

      await expect(handleSignTypedData(mockClient, [mockTypedData])).rejects.toThrow(
        'No signature returned from device'
      );
    });
  });

  describe('ensureHexString', () => {
    it('should handle null or undefined input', () => {
      expect(ensureHexString(null)).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
      expect(ensureHexString(undefined)).toBe(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
    });

    it('should handle string input', () => {
      expect(ensureHexString('1234')).toBe('0x1234');
      expect(ensureHexString('0x1234')).toBe('0x1234');
    });

    it('should handle signature response input', () => {
      const mockSignature: SignData = {
        sig: {
          r: Buffer.from('1234', 'hex'),
          s: Buffer.from('5678', 'hex'),
          v: Buffer.from('01', 'hex'),
        },
      };
      expect(ensureHexString(mockSignature)).toBe('0x123456780100');
    });

    it('should throw error for invalid signature format', () => {
      expect(() => ensureHexString({} as any)).toThrow('Invalid signature format');
    });
  });
});

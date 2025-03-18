import {
  parseEther,
  parseGwei,
  hexToBigInt,
  type Transaction,
  type TransactionSerializable,
  hexToNumber,
  numberToHex,
  type Address,
  type Hex,
} from 'viem';
import { EthSignTransactionParams, WalletCall } from '../types';

export function formatTransaction(tx: EthSignTransactionParams): TransactionSerializable {
  return {
    to: tx.to as Address,
    nonce: tx.nonce ? hexToNumber(tx.nonce) : undefined,
    gasPrice: tx.gasPrice ? hexToBigInt(tx.gasPrice) : undefined,
    gas: tx.gasLimit ? hexToBigInt(tx.gasLimit) : undefined,
    value: tx.value ? hexToBigInt(tx.value) : undefined,
    data: (tx.data as Hex) || '0x',
    chainId: tx.chainId ? hexToNumber(tx.chainId) : 1,
  };
}

export function formatWalletCall(call: WalletCall, chainId: string): TransactionSerializable {
  return {
    to: (call.to as Address) || '0x0000000000000000000000000000000000000000',
    value: call.value ? hexToBigInt(call.value) : BigInt(0),
    data: (call.data as Hex) || '0x',
    chainId: hexToNumber(chainId as Hex),
  };
}

export function serializeTransaction(tx: TransactionSerializable): string {
  return JSON.stringify({
    chainId: tx.chainId,
    nonce: tx.nonce !== undefined ? `0x${tx.nonce.toString(16)}` : '0x0',
    gasPrice: tx.gasPrice !== undefined ? `0x${tx.gasPrice.toString(16)}` : '0x0',
    gasLimit: tx.gas !== undefined ? `0x${tx.gas.toString(16)}` : '0x0',
    to: tx.to || '0x0',
    value: tx.value !== undefined ? `0x${tx.value.toString(16)}` : '0x0',
    data: tx.data || '0x',
  });
}

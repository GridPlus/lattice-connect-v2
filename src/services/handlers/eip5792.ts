import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { Client, Constants } from 'gridplus-sdk';
import { createPublicClient, defineChain, http } from 'viem';
import {
  CallsStatusResult,
  HARDENED_OFFSET,
  MethodParams,
  SendCallsResult,
  StateData,
  STATUS_CODES,
  WalletCall,
} from './types';
import { serializeTransaction } from './utils/transactions';
import type { Address, TransactionSerializableLegacy } from 'viem';

export async function handleWalletSendCalls(
  client: Client,
  params: MethodParams['wallet_sendCalls'],
  state: StateData
): Promise<SendCallsResult> {
  const [callsRequest] = params;

  // Validate request
  if (!callsRequest?.version || !Array.isArray(callsRequest.calls)) {
    throw new Error('Invalid sendCalls parameters');
  }

  // Validate chainId matches current chain
  if (callsRequest.chainId !== state.chainConfig.chainId) {
    throw new Error('ChainId mismatch');
  }

  // Check capabilities
  if (callsRequest.capabilities) {
    for (const [name, capability] of Object.entries(callsRequest.capabilities)) {
      if (!capability.optional && !state.capabilities[callsRequest.chainId]?.[name]) {
        throw new Error(`Unsupported capability: ${name}`);
      }
    }
  }

  // Check call-specific capabilities
  for (const call of callsRequest.calls) {
    if (call.capabilities) {
      for (const [name, capability] of Object.entries(call.capabilities)) {
        if (!capability.optional && !state.capabilities[callsRequest.chainId]?.[name]) {
          throw new Error(`Unsupported capability in call: ${name}`);
        }
      }
    }
  }

  // Create viem chain configuration
  const chain = defineChain({
    id: Number(state.chainConfig.chainId),
    name: state.chainConfig.name,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [state.chainConfig.rpcUrl || ''],
      },
    },
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(state.chainConfig.rpcUrl),
  });

  // Generate or use provided ID
  const id = callsRequest.id || `0x${randomBytes(32).toString('hex')}`;

  // Process each call
  const processedCalls = await Promise.all(
    callsRequest.calls.map(async (call: WalletCall) => {
      // Get nonce and gas price from the network
      const nonce = await publicClient.getTransactionCount({
        address: callsRequest.from as Address,
      });

      const gasPrice = await publicClient.getGasPrice();
      const gasLimit = await publicClient.estimateGas({
        account: callsRequest.from as Address,
        to: call.to as Address,
        value: BigInt(call.value || '0'),
        data: call.data as Address,
      });

      const tx: TransactionSerializableLegacy = {
        type: 'legacy',
        to: call.to as Address | null,
        data: call.data as Address,
        value: BigInt(call.value || '0'),
        nonce: await publicClient.getTransactionCount({
          address: callsRequest.from as Address,
        }),
        gasPrice: await publicClient.getGasPrice(),
        gas: BigInt(21000), // Default gas limit, should be estimated
        chainId: Number(state.chainConfig.chainId),
      };

      // Sign the transaction
      const signature = await client.sign({
        currency: 'ETH',
        data: {
          signerPath: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
          payload: Buffer.from(serializeTransaction(tx)),
          curveType: Constants.SIGNING.CURVES.SECP256K1,
          hashType: Constants.SIGNING.HASHES.KECCAK256,
        },
      });

      if (!signature) {
        throw new Error('No signature returned from device');
      }

      // Convert signature to viem format
      const { sig } = signature as { sig: { r: Buffer; s: Buffer; v: Buffer } };
      const signatureObj = {
        r: `0x${sig.r.toString('hex')}`,
        s: `0x${sig.s.toString('hex')}`,
        yParity: Number(sig.v.toString('hex')) % 2,
      };

      const serializedTx = serializeTransaction(tx) as Address;
      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: serializedTx,
      });

      return {
        status: '0x1' as Address,
        transactionHash: txHash,
        logs: [],
      };
    })
  );

  // Store initial status
  const status: CallsStatusResult = {
    version: callsRequest.version,
    chainId: callsRequest.chainId,
    id,
    status: STATUS_CODES.PENDING,
    capabilities: callsRequest.capabilities,
    receipts: processedCalls,
  };

  state.pendingCalls.set(id, status);

  // Return exactly what the spec requires
  return {
    id,
    capabilities: callsRequest.capabilities,
  };
}

export function handleWalletGetCallStatus(
  params: MethodParams['wallet_getCallStatus'],
  state: StateData
): CallsStatusResult {
  const [callId] = params;
  if (!callId || typeof callId !== 'string' || callId === '0x') {
    throw new Error('Invalid call ID');
  }

  const status = state.pendingCalls.get(callId);
  if (!status) {
    throw new Error('Call ID not found');
  }

  return status;
}

export function handleWalletAddEthereumChain(
  params: MethodParams['wallet_addEthereumChain'],
  state: StateData,
  emitter?: EventEmitter
) {
  const [{ chainId, chainName, rpcUrls }] = params;
  if (!chainId || !chainName) {
    throw new Error('Invalid chain parameters');
  }

  // Update the chain config
  state.chainConfig = {
    chainId,
    name: chainName,
    rpcUrl: rpcUrls?.[0],
  };

  // Emit chainChanged
  if (emitter) {
    emitter.emit('chainChanged', chainId);
  }

  return { success: true };
}

export function handleGetCapabilities(
  params: MethodParams['wallet_getCapabilities'],
  state: StateData
) {
  const chainId = (params[0] || state.chainConfig.chainId) as `0x${string}`;
  const capabilities = state.capabilities[chainId] || {};

  return {
    capabilities,
  };
}

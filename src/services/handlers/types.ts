import { Constants } from 'gridplus-sdk';
import { WebSocket } from 'ws';

// EIP-1193 Parameter Types
export interface EthSignTransactionParams {
  to: `0x${string}`;
  from?: `0x${string}`;
  nonce?: `0x${string}`;
  gasPrice?: `0x${string}`;
  gasLimit?: `0x${string}`;
  value?: `0x${string}`;
  data?: `0x${string}`;
  chainId?: `0x${string}`;
}

export interface PersonalSignParams {
  message: `0x${string}`;
  address: `0x${string}`;
}

export interface TypedDataParams {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: `0x${string}`;
    salt?: `0x${string}`;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, any>;
}

// EIP-5792 Parameter Types
export interface AddEthereumChainParams {
  chainId: `0x${string}`;
  chainName: string;
  rpcUrls?: string[];
  iconUrls?: string[];
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface RequestPermissionsParams {
  [key: string]: {
    [key: string]: unknown;
  };
}

// Method Parameters Mapping
export interface MethodParams {
  eth_signTransaction: [EthSignTransactionParams];
  eth_sign: [string, string];
  personal_sign: [string, string];
  eth_signTypedData: [TypedDataParams];
  eth_signTypedData_v4: [TypedDataParams];
  wallet_sendCalls: [SendCallsRequest];
  wallet_getCallStatus: [`0x${string}`];
  wallet_addEthereumChain: [AddEthereumChainParams];
  wallet_requestPermissions: [RequestPermissionsParams];
  wallet_getPermissions: [];
  eth_chainId: [];
  eth_accounts: [];
  eth_requestAccounts: [];
  wallet_switchEthereumChain: [{ chainId: `0x${string}` }];
  eth_subscribe: [string, ...any[]];
  wallet_getCapabilities: [string?];
  wallet_showCallStatus: [`0x${string}`];
}

export interface RPCRequest<T extends keyof MethodParams> {
  method: T;
  params: MethodParams[T];
}

export interface ChainConfig {
  chainId: string;
  name: string;
  rpcUrl?: string;
}

export interface Capability {
  [key: string]: unknown;
  optional?: boolean;
}

export interface WalletCall {
  to?: `0x${string}`;
  data?: `0x${string}`;
  value?: `0x${string}`;
  capabilities?: Record<string, Capability>;
}

export interface SendCallsRequest {
  version: string;
  id?: string;
  from?: `0x${string}`;
  chainId: `0x${string}`;
  calls: WalletCall[];
  capabilities?: Record<string, Capability>;
}

export interface SendCallsResult {
  id: string;
  capabilities?: Record<string, any>;
}

export interface CallReceipt {
  status: `0x${string}`;
  transactionHash: `0x${string}`;
  blockHash?: `0x${string}`;
  blockNumber?: `0x${string}`;
  gasUsed?: `0x${string}`;
  logs: Array<{
    address: `0x${string}`;
    data: `0x${string}`;
    topics: `0x${string}`[];
  }>;
}

export interface CallsStatusResult {
  version: string;
  chainId: `0x${string}`;
  id: string;
  status: number;
  receipts?: CallReceipt[];
  capabilities?: Record<string, Capability>;
}

export interface WalletCapabilities {
  [chainId: `0x${string}`]: Record<string, any>;
}

export interface WalletPermission {
  parentCapability: string;
  date: number;
  caveats?: Array<{
    type: string;
    value: any;
  }>;
  invoker: string;
}

export interface StateData {
  clientData: string;
  chainConfig: ChainConfig;
  connectedAccounts: string[];
  permissions: WalletPermission[];
  pendingCalls: Map<string, CallsStatusResult>;
  capabilities: WalletCapabilities;
}

export interface EIP712MessagePayload {
  types: Record<string, Array<{ name: string; type: string }>>;
  domain: Record<string, any>;
  primaryType: string;
  message: Record<string, any>;
}

export type ETH_MESSAGE_PROTOCOLS = 'signPersonal' | 'eip712' | 'standard';

export interface SignRequestParams {
  currency: 'ETH' | 'ETH_MSG';
  data: {
    signerPath: number[];
    chainId?: number;
    payload: string | Buffer | Uint8Array | Buffer[] | Uint8Array[] | EIP712MessagePayload;
    curveType: typeof Constants.SIGNING.CURVES.SECP256K1;
    hashType: typeof Constants.SIGNING.HASHES.KECCAK256;
  };
}

export interface SignatureResponse {
  sig?: {
    r: Buffer;
    s: Buffer;
    v: Buffer;
  };
}

export const STATUS_CODES = {
  PENDING: 100, // Batch received but not executed
  CONFIRMED: 200, // Batch included onchain without reverts
  FAILED_OFFCHAIN: 400, // Batch not included and won't retry
  FAILED_ONCHAIN: 500, // Batch reverted completely
  FAILED_PARTIAL: 600, // Batch reverted partially
} as const;

export const HARDENED_OFFSET = 0x80000000;

export const DEFAULT_CHAIN: ChainConfig = {
  chainId: '0x1',
  name: 'Ethereum Mainnet',
};

export const DEFAULT_CAPABILITIES: WalletCapabilities = {
  '0x0': {
    'flow-control': {
      supported: true,
    },
  },
  '0x1': {
    wallet_sendCalls: {
      maxCalls: 10,
      supportedTypes: ['TRANSACTION'],
      atomicBatchSupported: true,
      gasEstimationSupported: true,
    },
  },
};

export interface ConnectRequest {
  deviceId: string;
  name?: string;
  password?: string;
  appSecret?: string;
}

export interface PairRequest {
  deviceId: string;
  pairingCode: string;
}

export interface ProviderRpcError extends Error {
  code: number;
  data?: unknown;
}

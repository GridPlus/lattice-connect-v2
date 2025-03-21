import { EventEmitter } from 'events';
import { Client, Constants } from 'gridplus-sdk';
import { HARDENED_OFFSET, MethodParams, SignatureResponse, StateData } from './types';
import { formatTransaction, serializeTransaction } from './utils/transactions';
import { randomBytes } from 'crypto';
import { ISigningService } from './interfaces';
import { RPCRequest } from './types';

export function ensureHexString(
  value: string | SignatureResponse | null | undefined
): `0x${string}` {
  if (!value) {
    return '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
  }

  if (typeof value === 'string') {
    return (value.startsWith('0x') ? value : `0x${value}`) as `0x${string}`;
  }

  if (value.sig?.r && value.sig?.s && value.sig?.v) {
    const r = value.sig.r.toString('hex');
    const s = value.sig.s.toString('hex');
    const v = value.sig.v.toString('hex') + '00';
    return ('0x' + r + s + v) as `0x${string}`;
  }

  throw new Error('Invalid signature format');
}

export async function handleEthSignTransaction(
  client: Client,
  params: MethodParams['eth_signTransaction']
) {
  const [tx] = params;
  if (!tx || !tx.to) {
    throw new Error('Invalid transaction parameters');
  }

  const formattedTx = formatTransaction(tx);
  const signature = await client.sign({
    currency: 'ETH',
    data: {
      signerPath: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
      payload: Buffer.from(serializeTransaction(formattedTx)),
      curveType: Constants.SIGNING.CURVES.SECP256K1,
      hashType: Constants.SIGNING.HASHES.KECCAK256,
    },
  });

  if (!signature?.sig?.r?.length || !signature?.sig?.s?.length || !signature?.sig?.v?.length) {
    throw new Error('No signature returned from device');
  }

  return {
    signature: ensureHexString(signature),
  };
}

export async function handlePersonalSign(
  client: Client,
  params: MethodParams['personal_sign'] | MethodParams['eth_sign'],
  method: 'eth_sign' | 'personal_sign'
) {
  const [address, message] = method === 'eth_sign' ? params : [params[1], params[0]];
  if (!address || !message) {
    throw new Error(`Invalid ${method} parameters`);
  }

  const signature = await client.sign({
    currency: 'ETH_MSG',
    data: {
      signerPath: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
      payload: Buffer.from(message.replace('0x', ''), 'hex'),
      curveType: Constants.SIGNING.CURVES.SECP256K1,
      hashType: Constants.SIGNING.HASHES.KECCAK256,
      protocol: 'signPersonal',
    },
  });

  if (!signature?.sig?.r?.length || !signature?.sig?.s?.length || !signature?.sig?.v?.length) {
    throw new Error('No signature returned from device');
  }

  return {
    signature: ensureHexString(signature),
  };
}

export async function handleSignTypedData(
  client: Client,
  params: MethodParams['eth_signTypedData']
) {
  const [typedData] = params;
  if (!typedData || !typedData.domain || !typedData.message) {
    throw new Error('Invalid typed data parameters');
  }

  const signature = await client.sign({
    currency: 'ETH_MSG',
    data: {
      signerPath: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
      payload: typedData,
      curveType: Constants.SIGNING.CURVES.SECP256K1,
      hashType: Constants.SIGNING.HASHES.KECCAK256,
      protocol: 'eip712',
    },
  });

  if (!signature?.sig?.r?.length || !signature?.sig?.s?.length || !signature?.sig?.v?.length) {
    throw new Error('No signature returned from device');
  }

  return {
    signature: ensureHexString(signature),
  };
}

export async function handleGetAccounts(
  client: Client,
  startPath: number[] = [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0]
) {
  const addresses = await client.getAddresses({
    startPath,
    n: 1,
  });

  if (!addresses || addresses.length === 0) {
    throw new Error('No addresses returned from device');
  }

  return {
    addresses: ((addresses || []) as string[]).map((addr) => ensureHexString(addr.toString())),
  };
}

export function handleGetChainId(state: StateData) {
  return {
    chainId: ensureHexString(state.chainConfig.chainId),
  };
}

export function handleEthSubscribe(params: MethodParams['eth_subscribe'], emitter?: EventEmitter) {
  const [subscriptionType] = params;
  if (!subscriptionType) {
    throw new Error('Invalid subscription parameters');
  }

  // Generate unique subscription ID
  const subscriptionId = randomBytes(16).toString('hex');

  // Handle subscription types
  switch (subscriptionType) {
    case 'newHeads': {
      // Emit initial subscription confirmation
      if (emitter) {
        emitter.emit('message', {
          type: 'eth_subscription',
          data: {
            subscription: subscriptionId,
            result: { subscriptionId },
          },
        });
      }
      break;
    }
    default:
      throw new Error(`Unsupported subscription type: ${subscriptionType}`);
  }

  return {
    subscriptionId,
  };
}

export const handleEIP1193Request = async (
  client: Client,
  request: RPCRequest<keyof MethodParams>,
  state: StateData,
  signingService: ISigningService
): Promise<unknown> => {
  switch (request.method) {
    case 'eth_signTransaction':
      return signingService.handleEthSignTransaction(client, request.params as MethodParams['eth_signTransaction']);
    case 'eth_sign':
    case 'personal_sign':
      return signingService.handlePersonalSign(client, request.params as MethodParams['personal_sign'], request.method);
    case 'eth_signTypedData':
    case 'eth_signTypedData_v4':
      return signingService.handleSignTypedData(client, request.params as MethodParams['eth_signTypedData']);
    case 'eth_accounts':
      return signingService.handleGetAccounts(client);
    case 'eth_chainId':
      return signingService.handleGetChainId(state);
    case 'eth_subscribe':
      return signingService.handleEthSubscribe(request.params as MethodParams['eth_subscribe']);
    default:
      throw new Error(`Method ${request.method} not supported`);
  }
};

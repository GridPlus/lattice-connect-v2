import crypto from 'crypto';
import { EventEmitter } from 'events';
import { NextFunction, Request, Response } from 'express';
import { Client, Utils } from 'gridplus-sdk';
import { Base64 } from 'ox';
import {
  handleEthSignTransaction,
  handleEthSubscribe,
  handleGetAccounts,
  handleGetChainId,
  handlePersonalSign,
  handleSignTypedData,
} from '../services/handlers/eip1193';
import {
  handleGetCapabilities,
  handleWalletAddEthereumChain,
  handleWalletGetCallStatus,
  handleWalletSendCalls,
} from '../services/handlers/eip5792';
import {
  AddEthereumChainParams,
  ConnectRequest,
  DEFAULT_CAPABILITIES,
  DEFAULT_CHAIN,
  MethodParams,
  PairRequest,
  RPCRequest,
  SendCallsRequest,
  StateData,
} from '../services/handlers/types';
import {
  handleGetPermissions,
  handleRequestPermissions,
  handleShowCallStatus,
  handleSwitchEthereumChain,
} from '../services/handlers/wallet';
import { getTokenFromClient } from '../middleware/authorization';

// Store device emitters globally as they need to be accessible across requests
const deviceEmitters = new Map<string, EventEmitter>();

// Hardened offset constant for BIP32
const HARDENED_OFFSET = 0x80000000;

/**
 * Get device emitter, creating one if it doesn't exist
 */
export const getDeviceEmitter = (deviceId: string): EventEmitter => {
  if (!deviceEmitters.has(deviceId)) {
    deviceEmitters.set(deviceId, new EventEmitter());
  }
  return deviceEmitters.get(deviceId)!;
};

/**
 * Connect to a device
 */
export const connectDevice = async (req: Request, res: Response) => {
  try {
    const params = req.body as ConnectRequest;

    if (!params.deviceId) {
      res.status(400).json({ message: 'missing deviceId' });
      return;
    }

    console.info(`Initializing connection for device ${params.deviceId}`);

    // Generate or use provided app secret
    const privKeyStr =
      params.appSecret ||
      Utils.generateAppSecret(
        params.deviceId,
        params.password || 'asdfasdf',
        params.name || 'SDK Test2'
      );
    const privKey = Buffer.from(privKeyStr as string, 'hex');

    // Create a new client instance with the app secret
    const client = new Client({
      name: params.name || 'SDK Test2',
      privKey,
      baseUrl: process.env.GRIDPLUS_CONNECT_URL,
      timeout: 120000, // 2 minutes
    });

    console.info('Client instance created with app secret');

    // Connect to the device
    const isPaired = await client.connect(params.deviceId);
    console.info(`Successfully connected to device ${params.deviceId}`);

    // Store client in request for token generation by middleware
    req.gridplusClient = client;

    // Emit connect event
    const emitter = getDeviceEmitter(params.deviceId);
    emitter.emit('connect', { chainId: DEFAULT_CHAIN.chainId });
    emitter.emit('accountsChanged', []);

    res.json({
      message: 'Connection initialized successfully',
      isPaired,
    });
  } catch (error: any) {
    console.error('Error during connection:', error);
    res.status(500).json({
      message: 'Failed to connect to device',
      error: error?.message || String(error),
    });
  }
};

/**
 * Pair with a device
 */
export const pairDevice = async (req: Request, res: Response) => {
  try {
    const { deviceId, pairingCode } = req.body as PairRequest;
    const client = req.gridplusClient!;

    if (!deviceId || !pairingCode) {
      res.status(400).json({ message: 'Missing deviceId or pairingCode' });
      return;
    }

    console.info(`Attempting to pair with device ${deviceId} using code ${pairingCode}`);

    // Pair with the device
    await client.pair(pairingCode);
    console.info(`Successfully paired with device ${deviceId}`);

    // Get addresses
    const addresses = await client.getAddresses({
      startPath: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
      n: 1,
    });

    // Convert addresses to string array
    const addressStrings = ((addresses || []) as string[]).map((addr) => addr.toString());

    // Emit accountsChanged event
    const emitter = getDeviceEmitter(deviceId);
    emitter.emit('accountsChanged', addressStrings);

    res.json({
      message: 'Device paired successfully',
      addresses: addressStrings,
      isPaired: true,
    });
  } catch (error: any) {
    console.error('Error pairing device:', error);
    res.status(500).json({
      message: 'Failed to pair with device',
      error: error?.message || String(error),
    });
  }
};

/**
 * Handle RPC method requests
 */
export const handleMethodRequest = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { method, params = [] } = req.body as RPCRequest<keyof MethodParams>;
    const client = req.gridplusClient!;
    const emitter = getDeviceEmitter(deviceId);

    // Prepare for state-dependent handlers
    const chainConfig = DEFAULT_CHAIN;
    let connectedAccounts: string[] = [];
    let capabilities = DEFAULT_CAPABILITIES;

    // Get accounts to populate state info
    try {
      const accounts = await client.getAddresses({
        startPath: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
        n: 1,
      });
      connectedAccounts = ((accounts || []) as string[]).map((addr) => addr.toString());
    } catch (e) {
      console.warn('Could not get accounts, using empty array');
    }

    // Partial state for handlers that need it
    const state: StateData = {
      clientData: client.getStateData(),
      chainConfig,
      connectedAccounts,
      permissions: [],
      pendingCalls: new Map(),
      capabilities,
    };

    switch (method) {
      case 'eth_chainId': {
        const result = handleGetChainId(state);
        res.json(result);
        return;
      }

      case 'eth_requestAccounts':
      case 'eth_accounts': {
        const result = await handleGetAccounts(client);
        state.connectedAccounts = result.addresses;
        if (JSON.stringify(result.addresses) !== JSON.stringify(state.connectedAccounts)) {
          emitter.emit('accountsChanged', result.addresses);
        }
        res.json(result);
        return;
      }

      case 'wallet_switchEthereumChain': {
        const result = handleSwitchEthereumChain(
          params as MethodParams['wallet_switchEthereumChain'],
          state,
          emitter
        );
        res.json(result);
        return;
      }

      case 'wallet_addEthereumChain': {
        const result = handleWalletAddEthereumChain(
          params as [AddEthereumChainParams],
          state,
          emitter
        );
        res.json(result);
        return;
      }

      case 'eth_signTransaction': {
        const result = await handleEthSignTransaction(
          client,
          params as MethodParams['eth_signTransaction']
        );
        res.json(result);
        return;
      }

      case 'eth_sign':
      case 'personal_sign': {
        const result = await handlePersonalSign(
          client,
          params as MethodParams['personal_sign'],
          method as 'eth_sign' | 'personal_sign'
        );
        res.json(result);
        return;
      }

      case 'eth_signTypedData':
      case 'eth_signTypedData_v4': {
        const result = await handleSignTypedData(
          client,
          params as MethodParams['eth_signTypedData']
        );
        res.json(result);
        return;
      }

      case 'eth_subscribe': {
        const result = handleEthSubscribe(params as MethodParams['eth_subscribe'], emitter);
        res.json(result);
        return;
      }

      case 'wallet_requestPermissions': {
        const result = handleRequestPermissions(
          params as MethodParams['wallet_requestPermissions'],
          state,
          req.headers.origin as string
        );
        res.json(result);
        return;
      }

      case 'wallet_getPermissions': {
        const result = handleGetPermissions(state);
        res.json(result);
        return;
      }

      case 'wallet_getCapabilities': {
        const result = handleGetCapabilities(
          params as MethodParams['wallet_getCapabilities'],
          state
        );
        res.json(result);
        return;
      }

      case 'wallet_showCallStatus': {
        const result = handleShowCallStatus(params as MethodParams['wallet_showCallStatus'], state);
        res.json(result);
        return;
      }

      case 'wallet_sendCalls': {
        const result = await handleWalletSendCalls(client, params as [SendCallsRequest], state);
        res.json(result);
        return;
      }

      case 'wallet_getCallStatus': {
        const result = handleWalletGetCallStatus(
          params as MethodParams['wallet_getCallStatus'],
          state
        );
        res.json(result);
        return;
      }

      default: {
        res.json({
          error: {
            code: 4200,
            message: `Method ${method} not supported`,
          },
        });
      }
    }
  } catch (error: any) {
    console.error('Error handling method request:', error);
    res.status(500).json({
      error: {
        code: 4000,
        message: error.message || 'Internal server error',
      },
    });
  }
};

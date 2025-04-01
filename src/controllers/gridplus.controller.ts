import crypto from 'crypto';
import { EventEmitter } from 'events';
import { NextFunction, Request, Response } from 'express';
import { Client, Utils } from 'gridplus-sdk';
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

// Store device emitters globally as they need to be accessible across requests
const deviceEmitters = new Map<string, EventEmitter>();

// Store state data by token
const tokenToStateMap = new Map<string, StateData>();
const deviceToTokenMap = new Map<string, string>();

// Hardened offset constant for BIP32
const HARDENED_OFFSET = 0x80000000;

/**
 * Generate a new token for device authentication
 */
export const generateToken = (deviceId: string): string => {
  const token = crypto.randomBytes(32).toString('hex');
  deviceToTokenMap.set(deviceId, token);
  return token;
};

/**
 * Get state data from token
 */
export const getStateFromToken = (token: string): StateData | undefined => {
  return tokenToStateMap.get(token);
};

/**
 * Update state data for token
 */
export const updateStateForToken = (token: string, state: StateData): void => {
  tokenToStateMap.set(token, state);
};

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
 * Authentication middleware
 */
export const authenticateRequest = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const state = getStateFromToken(token);
  if (!state) {
    res.status(401).json({ message: 'Unauthorized: Invalid token' });
    return;
  }

  req.deviceStateData = state;
  next();
};

/**
 * Initialize client middleware
 */
export const initializeMethodClient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId } = req.params;
    const { method } = req.body as RPCRequest<keyof MethodParams>;
    const state = req.deviceStateData!;

    if (!deviceId || !method) {
      res.status(400).json({ message: 'missing deviceId or method' });
      return;
    }

    // Create a new client instance and restore its state
    const client = new Client({
      name: 'SDK Test2',
      privKey: Buffer.alloc(32), // Temporary key, will be overwritten by state data
      baseUrl: process.env.GRIDPLUS_CONNECT_URL,
      timeout: 120000,
      stateData: state.clientData,
      setStoredClient: async (data: string | null) => {
        if (data) {
          state.clientData = data;
        }
        return Promise.resolve();
      },
    });

    // Attach client and deviceId to request
    req.gridplusClient = client;
    req.deviceId = deviceId;

    next();
  } catch (error) {
    console.error('Error initializing client:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
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

    let storedClientData = '';

    // Create a new client instance with the app secret
    const client = new Client({
      name: params.name || 'SDK Test2',
      privKey,
      baseUrl: process.env.GRIDPLUS_CONNECT_URL,
      timeout: 120000, // 2 minutes
      setStoredClient: async (data: string | null) => {
        storedClientData = data || '';
        return Promise.resolve();
      },
    });

    console.info('Client instance created with app secret');

    // Connect to the device
    await client.connect(params.deviceId);
    console.info(`Successfully connected to device ${params.deviceId}`);

    // Get initial addresses
    const addresses = await client.getAddresses({
      startPath: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
      n: 1,
    });

    // Convert addresses to string array, ensuring proper type
    const addressStrings = ((addresses || []) as string[]).map((addr) => addr.toString());

    // Create initial state
    const state: StateData = {
      clientData: client.getStateData(),
      chainConfig: DEFAULT_CHAIN,
      connectedAccounts: addressStrings,
      permissions: [],
      pendingCalls: new Map(),
      capabilities: DEFAULT_CAPABILITIES,
    };

    // Generate and store token
    const token = generateToken(params.deviceId);
    updateStateForToken(token, state);

    // Emit connect event
    const emitter = getDeviceEmitter(params.deviceId);
    emitter.emit('connect', { chainId: DEFAULT_CHAIN.chainId });
    emitter.emit('accountsChanged', addressStrings);

    res.json({
      token,
      message: 'Connection initialized successfully',
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

    if (!deviceId || !pairingCode) {
      res.status(400).json({ message: 'Missing deviceId or pairingCode' });
      return;
    }

    // Get token from deviceId
    const token = deviceToTokenMap.get(deviceId);
    if (!token) {
      res.status(404).json({ message: 'Device not found. Connect to the device first.' });
      return;
    }

    // Get state data from token
    const state = getStateFromToken(token);
    if (!state) {
      res.status(404).json({ message: 'Device state not found. Connect to the device first.' });
      return;
    }

    // Create a new client instance with state data
    const client = new Client({
      name: 'SDK Test2',
      privKey: Buffer.alloc(32), // Temporary key, will be overwritten by state data
      baseUrl: process.env.GRIDPLUS_CONNECT_URL,
      timeout: 120000, // 2 minutes
      stateData: state.clientData,
      setStoredClient: async (data: string | null) => {
        if (data) {
          state.clientData = data;
        }
        return Promise.resolve();
      },
    });

    console.info(`Attempting to pair with device ${deviceId} using code ${pairingCode}`);

    // Pair with the device
    await client.pair(pairingCode);
    console.info(`Successfully paired with device ${deviceId}`);

    // Update client state in our map
    state.clientData = client.getStateData();
    updateStateForToken(token, state);

    // Get addresses (to refresh the state)
    const addresses = await client.getAddresses({
      startPath: [HARDENED_OFFSET + 44, HARDENED_OFFSET + 60, HARDENED_OFFSET, 0, 0],
      n: 1,
    });

    // Convert addresses to string array
    const addressStrings = ((addresses || []) as string[]).map((addr) => addr.toString());
    state.connectedAccounts = addressStrings;

    // Update state and emit event if accounts changed
    updateStateForToken(token, state);
    const emitter = getDeviceEmitter(deviceId);
    if (JSON.stringify(addressStrings) !== JSON.stringify(state.connectedAccounts)) {
      emitter.emit('accountsChanged', addressStrings);
    }

    res.json({
      token,
      message: 'Device paired successfully',
      addresses: addressStrings,
    });
  } catch (error: any) {
    console.error('Error during pairing:', error);
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
    const state = req.deviceStateData!;
    const emitter = getDeviceEmitter(deviceId);
    const token = deviceToTokenMap.get(deviceId)!;

    const sendResponse = (data: any) => {
      // Update state in token map
      updateStateForToken(token, state);
      // Send response with new token
      res.json({ ...data, token });
    };

    switch (method) {
      case 'eth_chainId': {
        const result = handleGetChainId(state);
        sendResponse(result);
        return;
      }

      case 'eth_requestAccounts':
      case 'eth_accounts': {
        const result = await handleGetAccounts(client);
        state.connectedAccounts = result.addresses;
        if (JSON.stringify(result.addresses) !== JSON.stringify(state.connectedAccounts)) {
          emitter.emit('accountsChanged', result.addresses);
        }
        sendResponse(result);
        return;
      }

      case 'wallet_switchEthereumChain': {
        const result = handleSwitchEthereumChain(
          params as MethodParams['wallet_switchEthereumChain'],
          state,
          emitter
        );
        sendResponse(result);
        return;
      }

      case 'wallet_addEthereumChain': {
        const result = handleWalletAddEthereumChain(
          params as [AddEthereumChainParams],
          state,
          emitter
        );
        sendResponse(result);
        return;
      }

      case 'eth_signTransaction': {
        const result = await handleEthSignTransaction(
          client,
          params as MethodParams['eth_signTransaction']
        );
        sendResponse(result);
        return;
      }

      case 'eth_sign':
      case 'personal_sign': {
        const result = await handlePersonalSign(
          client,
          params as MethodParams['personal_sign'],
          method as 'eth_sign' | 'personal_sign'
        );
        sendResponse(result);
        return;
      }

      case 'eth_signTypedData':
      case 'eth_signTypedData_v4': {
        const result = await handleSignTypedData(
          client,
          params as MethodParams['eth_signTypedData']
        );
        sendResponse(result);
        return;
      }

      case 'eth_subscribe': {
        const result = handleEthSubscribe(params as MethodParams['eth_subscribe'], emitter);
        sendResponse(result);
        return;
      }

      case 'wallet_requestPermissions': {
        const result = handleRequestPermissions(
          params as MethodParams['wallet_requestPermissions'],
          state,
          req.headers.origin as string
        );
        sendResponse(result);
        return;
      }

      case 'wallet_getPermissions': {
        const result = handleGetPermissions(state);
        sendResponse(result);
        return;
      }

      case 'wallet_getCapabilities': {
        const result = handleGetCapabilities(
          params as MethodParams['wallet_getCapabilities'],
          state
        );
        sendResponse(result);
        return;
      }

      case 'wallet_showCallStatus': {
        const result = handleShowCallStatus(params as MethodParams['wallet_showCallStatus'], state);
        sendResponse(result);
        return;
      }

      case 'wallet_sendCalls': {
        const result = await handleWalletSendCalls(client, params as [SendCallsRequest], state);
        sendResponse(result);
        return;
      }

      case 'wallet_getCallStatus': {
        const result = handleWalletGetCallStatus(
          params as MethodParams['wallet_getCallStatus'],
          state
        );
        sendResponse(result);
        return;
      }

      default: {
        sendResponse({
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

import { IAppService, IApp } from "../core";
import { Request, Response, RequestHandler, NextFunction } from "express";
import { Client, Utils, Constants } from "gridplus-sdk";
import { createSigner } from "../clients/createSigner";
import { Server as WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { Socket } from 'net';
import crypto from "crypto";
import { EventEmitter } from "events";

interface EIP1193Request {
  method: string;
  params: any[];
}

interface ConnectRequest {
  deviceId: string;
  name?: string;
  password?: string;
  appSecret?: string;
}

interface ChainConfig {
  chainId: string;
  name: string;
  rpcUrl?: string;
}

interface ProviderConnectInfo {
  readonly chainId: string;
}

interface ProviderMessage {
  readonly type: string;
  readonly data: unknown;
}

interface ProviderRpcError extends Error {
  code: number;
  data?: unknown;
}

interface StateData {
  clientData: string;
  chainConfig: ChainConfig;
  connectedAccounts: string[];
}

// Extend Express Request type to include our client
declare global {
  namespace Express {
    interface Request {
      latticeClient?: Client;
      deviceStateData?: StateData;
      deviceId?: string;
    }
  }
}

const HARDENED_OFFSET = 0x80000000;

// Default chain configuration
const DEFAULT_CHAIN: ChainConfig = {
  chainId: "0x1",
  name: "Ethereum Mainnet"
};

export function useEIP1193Provider(service: IAppService) {
  const { app, logger } = service;
  const deviceEmitters = new Map<string, EventEmitter>();
  const wss = new WebSocketServer({ noServer: true });

  // Store state data by token
  const tokenToStateMap = new Map<string, StateData>();
  const deviceToTokenMap = new Map<string, string>();

  // Generate a new token
  const generateToken = (deviceId: string): string => {
    const token = crypto.randomBytes(32).toString('hex');
    deviceToTokenMap.set(deviceId, token);
    return token;
  };

  // Get state data from token
  const getStateFromToken = (token: string): StateData | undefined => {
    return tokenToStateMap.get(token);
  };

  // Update state data for token
  const updateStateForToken = (token: string, state: StateData): void => {
    tokenToStateMap.set(token, state);
  };

  // Authentication middleware
  const authenticateRequest: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ message: "Unauthorized: Missing or invalid token" });
      return;
    }

    const token = authHeader.split(' ')[1];
    const state = getStateFromToken(token);
    if (!state) {
      res.status(401).json({ message: "Unauthorized: Invalid token" });
      return;
    }

    req.deviceStateData = state;
    next();
  };

  // Handle WebSocket connection
  const appWithServer = app as unknown as { server: Server };
  if (appWithServer.server) {
    appWithServer.server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
      const deviceId = request.url?.split('/')?.[3];
      if (!deviceId) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        logger.info(`WebSocket connection established for device ${deviceId}`);
        
        // Create device emitter if it doesn't exist
        if (!deviceEmitters.has(deviceId)) {
          deviceEmitters.set(deviceId, new EventEmitter());
        }
        
        // Get emitter (we know it exists now)
        const emitter = deviceEmitters.get(deviceId)!;

        // Forward events to WebSocket client
        const eventHandlers = new Map<string, (data: any) => void>();

        const setupEventHandler = (eventName: string) => {
          const handler = (data: any) => {
            try {
              logger.info(`Emitting ${eventName} event with data:`, data);
              ws.send(JSON.stringify({ event: eventName, data }));
            } catch (error) {
              logger.error(`Error sending WebSocket event ${eventName}:`, error);
            }
          };
          eventHandlers.set(eventName, handler);
          emitter.on(eventName, handler);
        };

        // Setup handlers for all EIP-1193 events
        setupEventHandler('connect');
        setupEventHandler('disconnect');
        setupEventHandler('chainChanged');
        setupEventHandler('accountsChanged');
        setupEventHandler('message');

        ws.on('close', () => {
          // Clean up event handlers
          eventHandlers.forEach((handler, eventName) => {
            emitter.removeListener(eventName, handler);
          });
          eventHandlers.clear();
          logger.info(`WebSocket connection closed for device ${deviceId}`);
        });

        // Emit initial state if available
        const token = deviceToTokenMap.get(deviceId);
        if (token) {
          const state = getStateFromToken(token);
          if (state) {
            logger.info(`Emitting initial state for device ${deviceId}`);
            emitter.emit('connect', { chainId: state.chainConfig.chainId });
            emitter.emit('accountsChanged', state.connectedAccounts);
          }
        }
      });
    });
  }

  // Handle device connection and initialization
  const connectHandler: RequestHandler = async (req: Request, res: Response) => {
    try {
      const params = req.body as ConnectRequest;

      if (!params.deviceId) {
        res.status(400).json({ message: "missing deviceId" });
        return;
      }

      logger.info(`Initializing connection for device ${params.deviceId}`);

      // Generate or use provided app secret
      const privKeyStr = params.appSecret || Utils.generateAppSecret(params.deviceId, params.password || "asdfasdf", params.name || "SDK Test2");
      const privKey = Buffer.from(privKeyStr as string, 'hex');

      let storedClientData = '';

      // Create a new client instance with the app secret
      const client = new Client({
        name: params.name || "SDK Test2",
        privKey,
        baseUrl: process.env.LATTICE_CONNECT_URL,
        timeout: 120000, // 2 minutes
        setStoredClient: async (data: string | null) => {
          storedClientData = data || '';
          return Promise.resolve();
        }
      });

      logger.info("Client instance created with app secret");

      // Connect to the device
      await client.connect(params.deviceId);
      logger.info(`Successfully connected to device ${params.deviceId}`);

      // Get initial addresses
      const addresses = await client.getAddresses({
        startPath: [
          HARDENED_OFFSET + 44,
          HARDENED_OFFSET + 60,
          HARDENED_OFFSET,
          0,
          0,
        ],
        n: 1,
      });

      // Convert addresses to string array, ensuring proper type
      const addressStrings = ((addresses || []) as string[]).map(addr => addr.toString());

      // Create initial state
      const state: StateData = {
        clientData: client.getStateData(),
        chainConfig: DEFAULT_CHAIN,
        connectedAccounts: addressStrings
      };

      // Generate and store token
      const token = generateToken(params.deviceId);
      updateStateForToken(token, state);

      // Emit connect event
      const emitter = deviceEmitters.get(params.deviceId);
      if (emitter) {
        emitter.emit('connect', { chainId: DEFAULT_CHAIN.chainId });
        emitter.emit('accountsChanged', addressStrings);
      }

      res.json({
        token,
        message: "Connection initialized successfully",
      });
    } catch (error: any) {
      logger.error("Error during connection:", error);
      res.status(500).json({ 
        message: "Failed to connect to device",
        error: error?.message || String(error)
      });
    }
  };

  // Middleware to initialize client for method requests
  const initializeMethodClient: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { deviceId } = req.params;
      const { method, params } = req.body as EIP1193Request;
      const state = req.deviceStateData!;

      if (!deviceId || !method) {
        res.status(400).json({ message: "missing deviceId or method" });
        return;
      }

      // Create a new client instance and restore its state
      const client = new Client({
        name: "SDK Test2",
        privKey: Buffer.alloc(32), // Temporary key, will be overwritten by state data
        baseUrl: process.env.LATTICE_CONNECT_URL,
        timeout: 120000,
        stateData: state.clientData,
        setStoredClient: async (data: string | null) => {
          if (data) {
            state.clientData = data;
          }
          return Promise.resolve();
        }
      });

      // Attach client and deviceId to request
      req.latticeClient = client;
      req.deviceId = deviceId;

      next();
    } catch (error) {
      logger.error("Error initializing client:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };

  // Handle EIP-1193 requests
  const requestHandler: RequestHandler = async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;
      const { method, params } = req.body as EIP1193Request;
      const client = req.latticeClient!;
      const state = req.deviceStateData!;
      const emitter = deviceEmitters.get(deviceId);
      const token = deviceToTokenMap.get(deviceId)!;

      const sendResponse = (data: any) => {
        // Update state in token map
        updateStateForToken(token, state);
        // Send response with new token
        res.json({ ...data, token });
      };

      switch (method) {
        case "eth_chainId": {
          sendResponse({
            chainId: state.chainConfig.chainId
          });
          return;
        }

        case "eth_requestAccounts":
        case "eth_accounts": {
          const addresses = await client.getAddresses({
            startPath: [
              HARDENED_OFFSET + 44,
              HARDENED_OFFSET + 60,
              HARDENED_OFFSET,
              0,
              0,
            ],
            n: 1,
          });

          if (!addresses || addresses.length === 0) {
            throw new Error("No addresses returned from device");
          }

          // Convert addresses to string array, ensuring proper type
          const addressStrings = ((addresses || []) as string[]).map(addr => addr.toString());

          // Update state
          state.connectedAccounts = addressStrings;

          // Emit accountsChanged if accounts actually changed
          if (emitter && JSON.stringify(addressStrings) !== JSON.stringify(state.connectedAccounts)) {
            emitter.emit('accountsChanged', addressStrings);
          }

          sendResponse({
            addresses: addressStrings
          });
          return;
        }

        case "wallet_switchEthereumChain": {
          const [{ chainId }] = params;
          if (!chainId || typeof chainId !== 'string') {
            throw new Error("Invalid chainId parameter");
          }
          
          // Update the chain config
          state.chainConfig = {
            ...state.chainConfig,
            chainId
          };

          // Emit chainChanged
          if (emitter) {
            emitter.emit('chainChanged', chainId);
          }

          sendResponse({
            success: true
          });
          return;
        }

        case "wallet_addEthereumChain": {
          const [{ chainId, chainName, rpcUrls }] = params;
          if (!chainId || !chainName) {
            throw new Error("Invalid chain parameters");
          }

          // Update the chain config
          state.chainConfig = {
            chainId,
            name: chainName,
            rpcUrl: rpcUrls?.[0]
          };

          // Emit chainChanged
          if (emitter) {
            emitter.emit('chainChanged', chainId);
          }

          sendResponse({
            success: true
          });
          return;
        }

        case "eth_signTransaction": {
          const [tx] = params;
          if (!tx || !tx.to) {
            throw new Error("Invalid transaction parameters");
          }

          // Sign directly with the client instead of using MQTT
          const signature = await client.sign({
            currency: 'ETH',
            data: {
              signerPath: [
                HARDENED_OFFSET + 44,
                HARDENED_OFFSET + 60,
                HARDENED_OFFSET,
                0,
                0
              ],
              ...tx,
              protocol: 'signTx',
              curveType: Constants.SIGNING.CURVES.SECP256K1,
              hashType: Constants.SIGNING.HASHES.KECCAK256
            }
          });

          if (!signature) {
            throw new Error("No signature returned from device");
          }

          // Convert signature to hex string
          let signatureHex: string;
          if (typeof signature === 'string') {
            signatureHex = signature;
          } else if (signature.sig && signature.sig.r && signature.sig.s && signature.sig.v) {
            signatureHex = '0x' + 
              signature.sig.r.toString('hex') + 
              signature.sig.s.toString('hex') + 
              signature.sig.v.toString('hex');
          } else {
            throw new Error("Invalid signature format returned from device");
          }

          sendResponse({
            signature: signatureHex
          });
          return;
        }

        case "eth_sign": {
          const [address, message] = params;
          if (!address || !message) {
            throw new Error("Invalid eth_sign parameters");
          }

          // Sign directly with the client instead of using MQTT
          const signature = await client.sign({
            currency: 'ETH_MSG',
            data: {
              signerPath: [
                HARDENED_OFFSET + 44,
                HARDENED_OFFSET + 60,
                HARDENED_OFFSET,
                0,
                0
              ],
              protocol: 'signPersonal',
              payload: message,
              curveType: Constants.SIGNING.CURVES.SECP256K1,
              hashType: Constants.SIGNING.HASHES.KECCAK256
            }
          });

          if (!signature) {
            throw new Error("No signature returned from device");
          }

          // Convert signature to hex string
          let signatureHex: string;
          if (typeof signature === 'string') {
            signatureHex = signature;
          } else if (signature.sig && signature.sig.r && signature.sig.s && signature.sig.v) {
            signatureHex = '0x' + 
              signature.sig.r.toString('hex') + 
              signature.sig.s.toString('hex') + 
              signature.sig.v.toString('hex');
          } else {
            throw new Error("Invalid signature format returned from device");
          }

          sendResponse({
            signature: signatureHex
          });
          return;
        }

        case "personal_sign": {
          const [message, address] = params;
          if (!address || !message) {
            throw new Error("Invalid personal_sign parameters");
          }

          // Sign directly with the client instead of using MQTT
          const signature = await client.sign({
            currency: 'ETH_MSG',
            data: {
              signerPath: [
                HARDENED_OFFSET + 44,
                HARDENED_OFFSET + 60,
                HARDENED_OFFSET,
                0,
                0
              ],
              protocol: 'signPersonal',
              payload: message,
              curveType: Constants.SIGNING.CURVES.SECP256K1,
              hashType: Constants.SIGNING.HASHES.KECCAK256
            }
          });

          if (!signature) {
            throw new Error("No signature returned from device");
          }

          // Convert signature to hex string
          let signatureHex: string;
          if (typeof signature === 'string') {
            signatureHex = signature;
          } else if (signature.sig && signature.sig.r && signature.sig.s && signature.sig.v) {
            signatureHex = '0x' + 
              signature.sig.r.toString('hex') + 
              signature.sig.s.toString('hex') + 
              signature.sig.v.toString('hex');
          } else {
            throw new Error("Invalid signature format returned from device");
          }

          sendResponse({
            signature: signatureHex
          });
          return;
        }

        case "eth_signTypedData":
        case "eth_signTypedData_v4": {
          const [typedData] = params;
          if (!typedData || !typedData.domain || !typedData.message) {
            throw new Error("Invalid typed data parameters");
          }

          // Sign directly with the client instead of using MQTT
          const signature = await client.sign({
            currency: 'ETH_MSG',
            data: {
              signerPath: [
                HARDENED_OFFSET + 44,
                HARDENED_OFFSET + 60,
                HARDENED_OFFSET,
                0,
                0
              ],
              protocol: 'eip712',
              payload: typedData,
              curveType: Constants.SIGNING.CURVES.SECP256K1,
              hashType: Constants.SIGNING.HASHES.KECCAK256
            }
          });

          if (!signature) {
            throw new Error("No signature returned from device");
          }

          // Convert signature to hex string
          let signatureHex: string;
          if (typeof signature === 'string') {
            signatureHex = signature;
          } else if (signature.sig && signature.sig.r && signature.sig.s && signature.sig.v) {
            signatureHex = '0x' + 
              signature.sig.r.toString('hex') + 
              signature.sig.s.toString('hex') + 
              signature.sig.v.toString('hex');
          } else {
            throw new Error("Invalid signature format returned from device");
          }

          sendResponse({
            signature: signatureHex
          });
          return;
        }

        case "eth_subscribe": {
          const [subscriptionType] = params;
          if (!subscriptionType) {
            throw new Error("Invalid subscription parameters");
          }

          // Generate unique subscription ID
          const subscriptionId = crypto.randomBytes(16).toString('hex');

          // Handle subscription types
          switch (subscriptionType) {
            case 'newHeads': {
              // Emit initial subscription confirmation
              if (emitter) {
                emitter.emit('message', {
                  type: 'eth_subscription',
                  data: {
                    subscription: subscriptionId,
                    result: { subscriptionId }
                  }
                });
              }
              break;
            }
            default:
              throw new Error(`Unsupported subscription type: ${subscriptionType}`);
          }

          sendResponse({
            subscriptionId
          });
          return;
        }

        default:
          res.status(400).json({ 
            message: "Unsupported method",
            error: `Method ${method} is not supported`
          });
          return;
      }
    } catch (error: any) {
      logger.error("Error handling EIP-1193 request:", error);
      const errorMessage = error?.message || String(error);
      const statusCode = errorMessage.includes("needs resync") ? 409 : 500;
      
      // Emit disconnect event on fatal errors
      if (statusCode === 500) {
        const emitter = deviceEmitters.get(req.params.deviceId);
        if (emitter) {
          const rpcError: ProviderRpcError = {
            name: "ProviderRpcError",
            message: errorMessage,
            code: 4900, // Per EIP-1193 spec
            stack: error?.stack
          };
          emitter.emit('disconnect', rpcError);
        }
      }

      res.status(statusCode).json({ 
        message: "Failed to process request",
        error: errorMessage,
        code: error?.responseCode
      });
    }
  };

  // Register endpoints
  app.post("/api/v2/www", connectHandler);
  app.post("/api/v2/www/:deviceId", authenticateRequest, initializeMethodClient, requestHandler);
} 
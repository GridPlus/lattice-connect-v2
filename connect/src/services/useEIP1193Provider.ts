import { IAppService } from "../core";
import { Request, Response, RequestHandler, NextFunction } from "express";
import { Client, Utils, Constants } from "gridplus-sdk";
import { createSigner } from "../clients/createSigner";
import crypto from "crypto";

interface EIP1193Request {
  method: string;
  params: any[];
  stateData?: string;
}

interface ConnectRequest {
  deviceId: string;
  name?: string;
  password?: string;
  appSecret?: string;
}

// Extend Express Request type to include our client
declare global {
  namespace Express {
    interface Request {
      latticeClient?: Client;
      latticeStateData?: string;
    }
  }
}

const HARDENED_OFFSET = 0x80000000;

export function useEIP1193Provider(service: IAppService) {
  const { app, logger } = service;

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

      res.json({
        stateData: client.getStateData(),
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
      const { method, params, stateData } = req.body as EIP1193Request;

      if (!deviceId || !method || !stateData) {
        res.status(400).json({ message: "missing deviceId, method, or stateData" });
        return;
      }

      let storedClientData = stateData;

      // Create a new client instance and restore its state
      const client = new Client({
        name: "SDK Test2",
        privKey: Buffer.alloc(32), // Temporary key, will be overwritten by state data
        baseUrl: process.env.LATTICE_CONNECT_URL,
        timeout: 120000,
        stateData,
        setStoredClient: async (data: string | null) => {
          storedClientData = data || '';
          return Promise.resolve();
        }
      });

      // Attach client and state to request
      req.latticeClient = client;
      req.latticeStateData = storedClientData;

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

      switch (method) {
        case "eth_accounts": {
          const addresses = await client.getAddresses({
            startPath: [
              HARDENED_OFFSET + 44,
              HARDENED_OFFSET + 60,
              HARDENED_OFFSET,
              0,
              0,
            ],
            n: 1, // Get first address
          });

          if (!addresses || addresses.length === 0) {
            throw new Error("No addresses returned from device");
          }

          res.json({
            addresses,
            stateData: req.latticeStateData
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

          res.json({
            signature: signatureHex,
            stateData: req.latticeStateData
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

          res.json({
            signature: signatureHex,
            stateData: req.latticeStateData
          });
          return;
        }

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

          res.json({
            signature: signatureHex,
            stateData: req.latticeStateData
          });
          return;
        }

        default:
          res.status(400).json({ message: "Unsupported method" });
          return;
      }
    } catch (error: any) {
      logger.error("Error handling EIP-1193 request:", error);
      const errorMessage = error?.message || String(error);
      const statusCode = errorMessage.includes("needs resync") ? 409 : 500;
      res.status(statusCode).json({ 
        message: "Failed to process request",
        error: errorMessage,
        code: error?.responseCode
      });
    }
  };

  app.post("/api/eip1193/connect", connectHandler);
  app.post("/api/eip1193/:deviceId", initializeMethodClient, requestHandler);
} 
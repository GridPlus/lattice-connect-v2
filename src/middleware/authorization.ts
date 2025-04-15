import { NextFunction, Request, Response } from 'express';
import { Client } from 'gridplus-sdk';
import { Base64 } from 'ox';

/**
 * Create a token from client state data
 */
export const getTokenFromClient = (client: Client): string => {
  const clientData = client.getStateData();
  return Base64.fromString(clientData);
};

/**
 * Create client from token
 */
export const createClientFromToken = (token: string): Client => {
  const clientData = Base64.toString(token);
  return new Client({
    name: 'Lattice Connect',
    privKey: Buffer.alloc(32), // Will be overwritten by state data
    baseUrl: process.env.GRIDPLUS_CONNECT_URL,
    timeout: 120000,
    stateData: clientData,
  });
};

/**
 * Authentication middleware that builds client from token
 */
export const authenticateRequest = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // Build client from token
    const client = createClientFromToken(token);

    // If we get here, the token was valid
    req.gridplusClient = client;
    req.currentToken = token;

    next();
  } catch (error) {
    console.error('Invalid token format:', error);
    res.status(401).json({ message: 'Unauthorized: Invalid token format' });
  }
};

/**
 * Add deviceId to request
 */
export const initializeMethodClient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceId } = req.params;
    if (!deviceId) {
      res.status(400).json({ message: 'Missing deviceId' });
      return;
    }

    // Set deviceId for use in handler
    req.deviceId = deviceId;

    next();
  } catch (error) {
    console.error('Error initializing client:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Middleware that adds token to all JSON responses
 */
export const sendResponse = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  res.json = (data: any) => {
    // Only attach token if we have a client
    if (req.gridplusClient) {
      const token = getTokenFromClient(req.gridplusClient);
      return originalJson({ ...data, token });
    }
    return originalJson(data);
  };
  next();
};

/**
 * Express middleware for validating that method param exists
 */
export const validateMethod = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { method } = req.body;
    if (!method) {
      res.status(400).json({ message: 'Missing method parameter' });
      return;
    }
    next();
  } catch (error) {
    console.error('Error validating method:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Combine multiple middleware functions
 */
export const combineMiddleware = (
  ...middlewares: Array<(req: Request, res: Response, next: NextFunction) => void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const runMiddleware = (index: number) => {
      if (index >= middlewares.length) {
        return next();
      }

      middlewares[index](req, res, (err?: any) => {
        if (err) {
          return next(err);
        }
        runMiddleware(index + 1);
      });
    };

    runMiddleware(0);
  };
};

/**
 * Standard middleware configuration for RPC calls
 */
export const rpcMiddleware = combineMiddleware(
  authenticateRequest,
  initializeMethodClient,
  validateMethod,
  sendResponse
);

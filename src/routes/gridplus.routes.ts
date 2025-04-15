import { Router } from 'express';
import * as gridplusController from '../controllers/gridplus.controller';
import {
  authenticateRequest,
  initializeMethodClient,
  rpcMiddleware,
  sendResponse,
  validateMethod,
} from '../middleware/authorization';

const router = Router();

// Connect to a device - no auth needed
router.post('/connect', sendResponse, gridplusController.connectDevice);

// Pair with a device - needs authentication
router.post('/pair', authenticateRequest, sendResponse, gridplusController.pairDevice);

// Access device methods - needs full rpc middleware stack
router.post(
  '/:deviceId/method',
  rpcMiddleware, // Combined middleware: authenticateRequest, initializeMethodClient, validateMethod, sendResponse
  gridplusController.handleMethodRequest
);

export default router;

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
// POST /api/v1/device/connect
router.post('/connect', sendResponse, gridplusController.connectDevice);

// Pair with a device - needs authentication
// POST /api/v1/device/pair
router.post('/pair', authenticateRequest, sendResponse, gridplusController.pairDevice);

// Access device methods - needs full rpc middleware stack
// POST /api/v1/device/:deviceId/method
router.post(
  '/:deviceId/method',
  rpcMiddleware, // Combined middleware: authenticateRequest, initializeMethodClient, validateMethod, sendResponse
  gridplusController.handleMethodRequest
);

export default router;

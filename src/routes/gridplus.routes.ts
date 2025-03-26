import { Router } from 'express';
import * as gridplusController from '../controllers/gridplus.controller';

const router = Router();

// Connect to a device
router.post('/connect', gridplusController.connectDevice);

// Access device methods (with authentication and client initialization)
router.post(
  '/:deviceId/method',
  gridplusController.authenticateRequest,
  gridplusController.initializeMethodClient,
  gridplusController.handleMethodRequest
);

export default router;

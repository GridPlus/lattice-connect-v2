import { Router } from 'express';
import * as signingController from '../controllers/signing.controller';
import { validateDeviceId } from '../middleware/validate';

const router = Router();

// POST /api/v1/signing/:deviceId - Send a request for signing
router.post('/:deviceId', validateDeviceId, signingController.signRequest);

export default router;

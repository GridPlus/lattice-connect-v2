import { Router } from 'express';
import * as provisionController from '../controllers/provision.controller';

const router = Router();

// GET /api/v1/provision - Provision a new user
router.get('/', provisionController.createNewUser);

export default router;

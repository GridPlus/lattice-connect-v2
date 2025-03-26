import { Router } from 'express';
import * as provisionController from '../controllers/provision.controller';

const router = Router();

// GET /provision - Provision a new user
router.get('/', provisionController.createNewUser);

export default router;

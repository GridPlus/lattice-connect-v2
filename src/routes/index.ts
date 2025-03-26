import { Router } from 'express';
import signingRoutes from './signing.routes';
import provisionRoutes from './provision.routes';
import gridplusRoutes from './gridplus.routes';

const router = Router();

// Mount all route modules
router.use('/signing', signingRoutes);
router.use('/gridplus', gridplusRoutes);

// Only mount provisioning routes if ADMIN_CLIENT_HOST is set
if (process.env.ADMIN_CLIENT_HOST) {
  router.use('/provision', provisionRoutes);
}

export default router;

import { Router } from 'express';
import signingRoutes from './signing.routes';
import provisionRoutes from './provision.routes';
import gridplusRoutes from './gridplus.routes';
import legacyRoutes from './legacy.routes';

const router = Router();

// Mount all route modules with API versioning
router.use('/api/v1/signing', signingRoutes);
router.use('/api/v1/device', gridplusRoutes);

// Only mount provisioning routes if ADMIN_CLIENT_HOST is set
if (process.env.ADMIN_CLIENT_HOST) {
  router.use('/api/v1/provision', provisionRoutes);
}

// Mount legacy v1 routes at the root for backward compatibility
router.use('/', legacyRoutes);

export default router;

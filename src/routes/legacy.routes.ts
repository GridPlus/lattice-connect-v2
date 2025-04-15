import { Router } from 'express';
import { validateDeviceId } from '../middleware/validate';

// This is a placeholder router. The actual legacy functionality
// will be registered directly on the app instance in src/index.ts
// via the useSigning function to maintain backward compatibility
const router = Router();

export default router;

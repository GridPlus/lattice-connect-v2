import { Request } from 'express';

/**
 * Extracts deviceId from request parameters or body
 */
export function getDeviceId(req: Request): string {
  // First try to get deviceId from params (URL path)
  if (req.params && req.params.deviceId) {
    return req.params.deviceId;
  }

  // Then try to get deviceId from request body
  if (req.body && req.body.deviceId) {
    return req.body.deviceId;
  }

  throw new Error('Missing deviceId in request params or body');
}

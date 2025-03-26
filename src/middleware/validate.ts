import { Request, Response, NextFunction } from 'express';
import { createClient } from '../clients/createClient';
import { getDeviceId } from '../utils/deviceId';

/**
 * Validate device ID middleware
 * Checks if the device ID is valid by verifying it exists in the system
 */
export const validateDeviceId = async (req: Request, res: Response, next: NextFunction) => {
  const deviceId = getDeviceId(req);

  // Skip validation if MQTT_SKIP_USER_CHECK is set
  if (process.env.MQTT_SKIP_USER_CHECK) {
    return next();
  }

  try {
    // Create admin client to verify the device ID
    const broker = new URL(`${process.env.ADMIN_CLIENT_HOST}`);
    const { client } = await createClient({
      url: broker,
      username: process.env.ADMIN_CLIENT_USER || '',
      password: process.env.ADMIN_CLIENT_PASS || '',
    });

    // Check if device ID exists
    await client.get({ api: `users/${deviceId}` });
    next();
  } catch (error: any) {
    res.status(404).send({
      status: 404,
      message: `Device ID '${deviceId}' not found`,
    });
  }
};

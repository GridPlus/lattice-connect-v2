import { Request, Response } from 'express';
import { createSigner } from '../clients/createSigner';
import { getDeviceId } from '../utils/deviceId';
import { generateRequestId } from '../utils/requestId';

// Initialize signer client
const initSigner = () => {
  const broker = new URL(`${process.env.ADMIN_CLIENT_HOST}`);
  return createSigner(
    {
      host: broker.hostname,
      port: parseInt(`${process.env.MQTT_HTTP_PORT || '1883'}`),
      username: process.env.ADMIN_CLIENT_USER || '',
      password: process.env.ADMIN_CLIENT_PASS || '',
    },
    console
  );
};

// Cache the signer instance
let signerInstance: ReturnType<typeof createSigner> | null = null;

/**
 * Handle request signing
 * Sends the request to the device for signing approval
 */
export const signRequest = async (req: Request, res: Response) => {
  try {
    // Initialize signer if not already created
    if (!signerInstance) {
      signerInstance = initSigner();
    }

    const { signer } = signerInstance;
    const deviceId = getDeviceId(req);
    const requestId = generateRequestId();

    // Send request for approval and wait for response
    const response = await signer.sendForApproval(req.body, deviceId, requestId);

    // Return the response to the client
    res.send(response);
  } catch (error: any) {
    res.status(500).send({
      status: 500,
      message: `Error while attempting to relay message. Reason: '${error.message}'`,
    });
  }
};

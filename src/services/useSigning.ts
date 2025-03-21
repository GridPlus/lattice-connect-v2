require('dotenv').config();

import { Request, Response, Router } from 'express';
import { createClient } from '../clients/createClient';
import { createSigner } from '../clients/createSigner';
import { IAppService } from '../core';
import { getDeviceId } from '../utils/deviceId';
import { generateRequestId } from '../utils/requestId';

export function useSigning(service: IAppService) {
  const logger = service.logger;
  const broker = new URL(`${process.env.ADMIN_CLIENT_HOST}`);

  const { signer } = createSigner(
    {
      host: broker.hostname,
      port: parseInt(`${process.env.MQTT_HTTP_PORT}`),
      username: process.env.ADMIN_CLIENT_USER,
      password: process.env.ADMIN_CLIENT_PASS,
    },
    logger
  );

  const router = Router();

  const preflightCheck = async (deviceId: string | undefined, res: Response) => {
    if (process.env.MQTT_SKIP_USER_CHECK) {
      return;
    }
    await createClient({
      url: broker,
      username: process.env.ADMIN_CLIENT_USER,
      password: process.env.ADMIN_CLIENT_PASS,
    }).then(async ({ client }) => {
      await client
        .get({ api: `users/${deviceId}` })
        .then(() => logger.info('[4] Device ID: VALID'));
    });
  };

  router.post('/:deviceId', async (req: Request, res: Response) => {
    try {
      const deviceId = getDeviceId(req);
      const requestId = generateRequestId();
      const response = await signer.sendForApproval(req.body, deviceId, requestId);
      res.send(response);
    } catch (error: any) {
      res.status(500).send({
        status: 500,
        message: `Error while attempting to relay message. Reason: '${error.message}'`,
      });
    }
  });

  service.app.use(router);
}

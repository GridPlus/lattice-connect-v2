require('dotenv').config()

import { Request, Response } from "express";
import { IAppService } from "../core"
import { createClient } from "../clients/createClient"
import crypto from 'crypto'
import cluster from "cluster";
import { createSigner } from "../clients/createSigner";

export async function useSigning(service: IAppService) {
  const logger = service.logger
  const broker = new URL(`${process.env.ADMIN_CLIENT_HOST}`)

  const { signer } = createSigner({
    host: broker.hostname,
    port: parseInt(`${process.env.MQTT_HTTP_PORT}`),
    username: process.env.ADMIN_CLIENT_USER,
    password: process.env.ADMIN_CLIENT_PASS,
  }, logger)

  const getDeviceId = (req: Request): string | undefined => {
    return req.params?.deviceId
  }

  const generateRequestId = (): string => {
    return crypto.randomBytes(4).toString('hex')
  }

  const getRequestData = (req: Request): any | undefined => {
    return req.body.data?.data
  }

  const preflightCheck = async (deviceId: string | undefined, res: Response) => {
    if (process.env.MQTT_SKIP_USER_CHECK) { return }
    await createClient({
      url: broker,
      username: process.env.ADMIN_CLIENT_USER,
      password: process.env.ADMIN_CLIENT_PASS
    }).then(async ({ client }) => {
      await client.get({ api: `users/${deviceId}` }).then(() =>
        logger.info("[4] Device ID: VALID")
      )
    })
  }

  service.app.post("/:deviceId", async (req: Request, res: Response) => {
    const deviceId = getDeviceId(req)
    const requestId = generateRequestId()
    const requestData = getRequestData(req)

    logger.info("------------------------")
    logger.info("HANDLING MESSAGE [RELAY]")
    logger.info("------------------------")
    logger.info(`[0] Worker #${cluster.worker?.id} received payload...`)
    logger.info(`[1] Request ID created: '${requestId}'`)
    logger.info(`[2] Verifying deviceId: '${deviceId}'...`)

    //-------------------------------------------------------
    // Pre-flight check ✅
    // Validate the received payload
    //-------------------------------------------------------
    if (!requestData || !deviceId) {
      logger.info("[!] Failed to parse request (missing 'requestData' OR 'deviceId')")
      logger.info(`[!] 'deviceId': ${deviceId}`)
      return res.status(200).send({
        status: 400,
        message: "Invalid request"
      })
    }

    //-------------------------------------------------------
    // Pre-flight check ✅
    // Check to see if the user (deviceId) exists (OPTIONAL)
    //-------------------------------------------------------
    try {
      await preflightCheck(deviceId, res)
    } catch (error) {
      logger.info(`[!] Database request responded with: '${error}'`)
      return res.status(200).send({
        status: 401,
        message: "Unauthorized"
      })
    }

    //-------------------------------------------------------
    // Relay message; wait for approval 🔄
    //-------------------------------------------------------
    try {
      const payload = Buffer.from(requestData!)
      logger.info("[3] Payload: VALID")

      const response = await signer.sendForApproval(payload, deviceId, requestId)

      return res.send(response)
    } catch (error: any) {
      return res.status(500).send({
        status: 500,
        message: `Error while attempting to relay message. Reason: '${error.message}'`
      })
    }
  })
}

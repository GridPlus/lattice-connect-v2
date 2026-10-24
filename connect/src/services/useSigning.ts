import { Request, Response } from "express";
import { IAppService } from "../core"
import crypto from 'crypto'
import cluster from "cluster";
import { brokerOptions } from "../config";
import { connectBroker, createSigner, SignerResult } from "../clients/createSigner";

const toResponseBody = (result: SignerResult) => result.kind === "answered"
  ? { status: 200, message: result.payload }
  : { status: 500, message: "Timed out waiting for response from device" }

export async function useSigning(service: IAppService) {
  const logger = service.logger
  const signer = createSigner(connectBroker(brokerOptions(), logger), logger)

  service.app.post("/:deviceId", async (req: Request<{ deviceId: string }>, res: Response) => {
    const deviceId = req.params.deviceId
    const requestId = crypto.randomBytes(4).toString('hex')
    const requestData = req.body?.data?.data

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
    // Relay message; wait for approval 🔄
    //-------------------------------------------------------
    try {
      const payload = Buffer.from(requestData)
      logger.info("[3] Payload: VALID")

      const result = await signer.sendForApproval(payload, deviceId, requestId)
      return res.send(toResponseBody(result))
    } catch (error) {
      return res.status(500).send({
        status: 500,
        message: `Error while attempting to relay message. Reason: '${error instanceof Error ? error.message : error}'`
      })
    }
  })
}

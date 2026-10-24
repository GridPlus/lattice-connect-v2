import { Request, Response } from "express";
import { z } from "zod";
import { IAppService } from "../core"
import crypto from 'crypto'
import cluster from "cluster";
import { brokerOptions } from "../config";
import { connectBroker, createSigner, SignerResult } from "../clients/createSigner";

/** The SDK posts the request frame as `{ data: { data: <bytes or string> } }`. */
const RelayRequest = z.object({
  data: z.object({
    data: z.union([z.string().min(1), z.array(z.number())]),
  }),
})

const toResponseBody = (result: SignerResult) => result.kind === "answered"
  ? { status: 200, message: result.payload }
  : { status: 500, message: "Timed out waiting for response from device" }

export function useSigning({ app, logger }: IAppService) {
  const signer = createSigner(connectBroker(brokerOptions(), logger), logger)

  app.post("/:deviceId", async (req: Request<{ deviceId: string }>, res: Response) => {
    const deviceId = req.params.deviceId
    const requestId = crypto.randomBytes(4).toString('hex')
    const parsed = RelayRequest.safeParse(req.body)
    const payload = parsed.success ? Buffer.from(parsed.data.data.data) : undefined

    logger.info(`.: [relay] Worker #${cluster.worker?.id} received request '${requestId}' for device '${deviceId}'`)

    // The route only matches a non-empty deviceId, so only the payload needs checking.
    if (!payload) {
      logger.info(`.: [relay] Rejected request '${requestId}': missing or malformed 'data.data'`)
      return res.status(200).send({
        status: 400,
        message: "Invalid request"
      })
    }

    try {
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

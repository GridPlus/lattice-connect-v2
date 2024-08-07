import MQTT, { IClientOptions } from "async-mqtt"
import bs58 from "bs58"
import crypto from 'crypto'
import { EventEmitter } from "stream"

export interface ISignerClient {
  sendForApproval: (payload: Buffer, deviceId: string, requestId: string) => Promise<void>,
}

export function createSigner(config: IClientOptions, logger?: any): { signer: ISignerClient } {
  //--------------------------------------------------------------------------------
  // CLIENT: MQTT Connection
  //--------------------------------------------------------------------------------
  const protocol = process.env["MQTT_HTTP_PORT"] === "8883" ? 'mqtts' : 'mqtt'
  const client = MQTT.connect(null, {
    clientId: `lattice-${bs58.encode(crypto.randomBytes(8)).slice(6).toUpperCase()}`,
    protocol: protocol,
    ...config
  })

  //--------------------------------------------------------------------------------
  // EMITTER: 'Message Received'
  //--------------------------------------------------------------------------------
  const msgEmitter = new EventEmitter()
  const computeEmitterKey = (deviceId: string, requestId: string) => deviceId + requestId

  //--------------------------------------------------------------------------------
  // TOPICS: 'TO Agent (Publish)' & 'FROM Agent (Subscribe)'
  //--------------------------------------------------------------------------------
  const publishTopic = (deviceId, requestId) => `to_agent/${deviceId}/request/${requestId}`
  const subscribeTopic = (deviceId, requestId) => `from_agent/${deviceId}/response/${requestId}`

  //--------------------------------------------------------------------------------
  // EVENT: 'Connect'
  //--------------------------------------------------------------------------------
  client.on("connect", (stream) => {
    logger?.info(".: [!] MQTT client connected")
  })

  //--------------------------------------------------------------------------------
  // EVENT: 'Reconnect'
  //--------------------------------------------------------------------------------
  client.on("reconnect", () => {
    logger?.info(".: [!] MQTT client reconnecting...")
  })

  //--------------------------------------------------------------------------------
  // EVENT: 'Disconnect'
  //--------------------------------------------------------------------------------
  client.on("disconnect", (stream) => {
    logger?.info(".: [!] MQTT client disconnected")
  })

  //--------------------------------------------------------------------------------
  // EVENT: '(On) Message'
  //--------------------------------------------------------------------------------
  client.on("message", (topic, payload) => {
    const receivedDeviceId = topic.split('/')[1]
    const receivedRequestId = topic.split('/')[3]
    const receievedPayload = payload.toString('hex')

    // LOG: Confirmation
    logger?.info(".: [!] MQTT client receieved:\n", JSON.stringify({
      topic: topic,
      deviceId: receivedDeviceId,
      requestId: receivedRequestId,
      payload: `${payload.length} bytes`
    }, null, 2))

    const emitterKey = computeEmitterKey(receivedDeviceId, receivedRequestId)
    msgEmitter.emit(emitterKey, receievedPayload)
  })

  function sendForApproval(payload: Buffer, deviceId: string, requestId: string): Promise<any> {
    return new Promise(async (res, rej) => {
      // LOG: Initiation
      logger?.info(".: [a] Processing request:\n", JSON.stringify({
        deviceId: deviceId,
        requestId: requestId,
        payload: `${payload.length} bytes`
      }, null, 2))

      try {
        await client.subscribe(subscribeTopic(deviceId, requestId), { qos: 1 })
        await client.publish(publishTopic(deviceId, requestId), payload, {
          qos: 1,
          retain: false,
          dup: false
        })
      }
      /**
       * Catch 'error'
       */
      catch (error) {
        logger?.info(".: [!] Error:\n", JSON.stringify({
          error
        }))
        return rej(error)
      }

      const emitterKey = computeEmitterKey(deviceId, requestId)
      const duration = 120000

      setTimeout(() => {
        msgEmitter.emit(emitterKey, "TIMED_OUT")
      }, duration)

      msgEmitter.once(emitterKey, async (payload) => {
        try {
          /**
           * Unsubscribe & parse 'response'
           */
          await client
            .unsubscribe(subscribeTopic(deviceId, requestId))
            .then(() => {
              let response = {}
              if (payload === "TIMED_OUT") {
                response = {
                  status: 500,
                  message: "Timed out waiting for response from device"
                }

                // LOG: Status Update
                logger?.info(`.: [!] Request timed out: ${JSON.stringify({ deviceId, requestId }, null, 2)}`)
              }
              else {
                response = {
                  status: 200,
                  message: payload
                }
              }
              // LOG: Confirmation
              logger?.info(".: [b] Responding with:\n", JSON.stringify({ payload: `${payload.length} bytes` }, null, 2))
              return response
            })
            .then(res)
        }
        /**
         * Catch 'error'
         */
        catch (error) {
          logger?.info(".: [!] Error:\n", JSON.stringify({
            error
          }))
          /**
           * REJECT: 'error'
           */
          rej(error)
        }
      })

      // LOG: Send & Wait
      logger?.info(`.: [?] Awaiting approval (with timeout: ${duration}ms)...`)
    })
  }

  return { signer: { sendForApproval } }
}
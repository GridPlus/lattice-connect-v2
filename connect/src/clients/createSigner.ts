import mqtt, { IClientOptions, MqttClient } from "mqtt"
import bs58 from "bs58"
import crypto from 'crypto'
import { EventEmitter, once } from "node:events"
import type { Logger } from "../core"

/** The part of an MQTT connection the signer uses. */
export type BrokerClient = Pick<MqttClient, "on" | "subscribeAsync" | "publishAsync" | "unsubscribeAsync">

export type SignerResult =
  | { kind: "answered", payload: string }
  | { kind: "timedOut" }

export interface ISignerClient {
  sendForApproval: (payload: Buffer, deviceId: string, requestId: string) => Promise<SignerResult>,
}

const DEVICE_TIMEOUT_MS = 120000

const publishTopic = (deviceId: string, requestId: string) => `to_agent/${deviceId}/request/${requestId}`
const subscribeTopic = (deviceId: string, requestId: string) => `from_agent/${deviceId}/response/${requestId}`
const replyKey = (deviceId: string, requestId: string) => deviceId + requestId

/** Connects to the broker on the Lattice1, retrying for as long as the relay runs. */
export function connectBroker(config: IClientOptions, logger?: Logger): MqttClient {
  const client = mqtt.connect({
    clientId: `lattice-${bs58.encode(crypto.randomBytes(8)).slice(6).toUpperCase()}`,
    // mqtt v5 stops retrying after a refused CONNACK unless this is set; v4 kept retrying.
    reconnectOnConnackError: true,
    ...config
  })
  // The smoke test waits for "MQTT client connected" before it sends requests.
  client.on("connect", () => logger?.info(".: [!] MQTT client connected"))
  client.on("reconnect", () => logger?.info(".: [!] MQTT client reconnecting..."))
  client.on("disconnect", () => logger?.info(".: [!] MQTT client disconnected"))
  return client
}

export function createSigner(client: BrokerClient, logger?: Logger, timeoutMs = DEVICE_TIMEOUT_MS): { signer: ISignerClient } {
  const replies = new EventEmitter()

  client.on("message", (topic, payload) => {
    const [, deviceId, , requestId] = topic.split('/')
    logger?.info(".: [!] MQTT client receieved:\n", JSON.stringify({
      topic,
      deviceId,
      requestId,
      payload: `${payload.length} bytes`
    }, null, 2))
    replies.emit(replyKey(deviceId, requestId), payload.toString('hex'))
  })

  async function sendForApproval(payload: Buffer, deviceId: string, requestId: string): Promise<SignerResult> {
    logger?.info(".: [a] Processing request:\n", JSON.stringify({
      deviceId,
      requestId,
      payload: `${payload.length} bytes`
    }, null, 2))

    const responseTopic = subscribeTopic(deviceId, requestId)
    const listening = new AbortController()
    let timer: NodeJS.Timeout | undefined

    // Listen before publishing: the device can reply before the publish is acknowledged.
    const reply = once(replies, replyKey(deviceId, requestId), { signal: listening.signal })
      .then(([hex]): SignerResult => ({ kind: "answered", payload: hex }))
    // Stopping the listener rejects 'reply'; that is expected and not an error.
    reply.catch(() => undefined)

    try {
      await client.subscribeAsync(responseTopic, { qos: 1 })
      await client.publishAsync(publishTopic(deviceId, requestId), payload, {
        qos: 1,
        retain: false,
        dup: false
      })

      // The timeout starts only after the publish, so a request that the broker
      // has not accepted yet cannot time out and then reach the device later.
      const timedOut = new Promise<SignerResult>(res => {
        timer = setTimeout(() => res({ kind: "timedOut" }), timeoutMs)
      })
      logger?.info(`.: [?] Awaiting approval (with timeout: ${timeoutMs}ms)...`)

      const result = await Promise.race([reply, timedOut])
      if (result.kind === "timedOut") {
        logger?.info(`.: [!] Request timed out: ${JSON.stringify({ deviceId, requestId }, null, 2)}`)
      } else {
        logger?.info(".: [b] Responding with:\n", JSON.stringify({ payload: `${result.payload.length / 2} bytes` }, null, 2))
      }
      await client.unsubscribeAsync(responseTopic)
      return result
    } catch (error) {
      logger?.info(".: [!] Error:\n", JSON.stringify({ error }))
      throw error
    } finally {
      clearTimeout(timer)
      listening.abort()
    }
  }

  return { signer: { sendForApproval } }
}

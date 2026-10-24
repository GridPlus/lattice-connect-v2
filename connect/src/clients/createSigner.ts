import mqtt, { IClientOptions, IClientPublishOptions, MqttClient } from "mqtt"
import bs58 from "bs58"
import crypto from 'crypto'
import { EventEmitter, once } from "node:events"
import type { Logger } from "../core"

/** The broker calls the signer makes. An MQTT client satisfies it. */
export interface BrokerClient {
  on(event: "message", listener: (topic: string, payload: Buffer) => void): unknown
  subscribeAsync(topic: string, opts: { qos: 1 }): Promise<unknown>
  publishAsync(topic: string, message: Buffer, opts: IClientPublishOptions): Promise<unknown>
  unsubscribeAsync(topic: string): Promise<unknown>
}

export type SignerResult =
  | { kind: "answered", payload: string }
  | { kind: "timedOut" }

export interface Signer {
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

export function createSigner(client: BrokerClient, logger?: Logger, timeoutMs = DEVICE_TIMEOUT_MS): Signer {
  const replies = new EventEmitter()

  client.on("message", (topic, payload) => {
    const [, deviceId, , requestId] = topic.split('/')
    logger?.info(".: [!] MQTT client received:\n", JSON.stringify({
      topic,
      deviceId,
      requestId,
      payload: `${payload.length} bytes`
    }, null, 2))
    replies.emit(replyKey(deviceId, requestId), payload.toString('hex'))
  })

  return {
    sendForApproval: (payload, deviceId, requestId) =>
      relay({ client, replies, logger, timeoutMs }, payload, deviceId, requestId)
  }
}

interface RelayContext {
  client: BrokerClient,
  replies: EventEmitter,
  logger?: Logger,
  timeoutMs: number,
}

async function relay({ client, replies, logger, timeoutMs }: RelayContext, payload: Buffer, deviceId: string, requestId: string): Promise<SignerResult> {
  logger?.info(".: [a] Processing request:\n", JSON.stringify({
    deviceId,
    requestId,
    payload: `${payload.length} bytes`
  }, null, 2))

  const responseTopic = subscribeTopic(deviceId, requestId)
  // Listen before publishing: the device can reply before the publish is acknowledged.
  const listener = listenForReply(replies, replyKey(deviceId, requestId))
  let deadline: Deadline | undefined

  try {
    await client.subscribeAsync(responseTopic, { qos: 1 })
    await client.publishAsync(publishTopic(deviceId, requestId), payload, {
      qos: 1,
      retain: false,
      dup: false
    })

    // The timeout starts only after the publish, so a request that the broker
    // has not accepted yet cannot time out and then reach the device later.
    deadline = startDeadline(timeoutMs)
    logger?.info(`.: [?] Awaiting approval (with timeout: ${timeoutMs}ms)...`)

    const result = await Promise.race([listener.reply, deadline.timedOut])
    logOutcome(logger, result, deviceId, requestId)
    return result
  } catch (error) {
    logger?.info(".: [!] Error:\n", JSON.stringify({ error }))
    throw error
  } finally {
    deadline?.cancel()
    listener.stop()
    // Cleanup only: the outcome is already decided, so a failure here must not change it.
    await client.unsubscribeAsync(responseTopic).catch(error =>
      logger?.info(".: [!] Unsubscribe failed:\n", JSON.stringify({ responseTopic, error }))
    )
  }
}

function listenForReply(replies: EventEmitter, key: string) {
  const listening = new AbortController()
  const reply = once(replies, key, { signal: listening.signal })
    .then(([hex]): SignerResult => ({ kind: "answered", payload: hex }))
  // Stopping the listener rejects 'reply'; that is expected and not an error.
  reply.catch(() => undefined)
  return { reply, stop: () => listening.abort() }
}

interface Deadline {
  timedOut: Promise<SignerResult>,
  cancel: () => void,
}

function startDeadline(ms: number): Deadline {
  let timer: NodeJS.Timeout | undefined
  const timedOut = new Promise<SignerResult>(res => {
    timer = setTimeout(() => res({ kind: "timedOut" }), ms)
  })
  return { timedOut, cancel: () => clearTimeout(timer) }
}

function logOutcome(logger: Logger | undefined, result: SignerResult, deviceId: string, requestId: string) {
  if (result.kind === "timedOut") {
    logger?.info(`.: [!] Request timed out: ${JSON.stringify({ deviceId, requestId }, null, 2)}`)
  } else {
    logger?.info(".: [b] Responding with:\n", JSON.stringify({ payload: `${result.payload.length / 2} bytes` }, null, 2))
  }
}

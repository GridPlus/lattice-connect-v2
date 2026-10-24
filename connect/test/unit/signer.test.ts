import { test } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { setTimeout as sleep } from "node:timers/promises"
import { BrokerClient, createSigner } from "../../src/clients/createSigner"

const REQUEST = Buffer.from([1, 2, 3])
const RESPONSE_TOPIC = "from_agent/dev1/response/req1"

/** Stands in for the broker connection. Each step can be delayed or made to fail. */
function fakeBroker(opts: {
  publishDelayMs?: number,
  publishError?: Error,
  unsubscribeError?: Error,
  replyAfterPublishMs?: number,
  replyBeforePublishAck?: boolean,
} = {}) {
  const events = new EventEmitter()
  const unsubscribed: string[] = []
  const reply = () => events.emit("message", RESPONSE_TOPIC, Buffer.from([3, 2, 1]))

  const client: BrokerClient = {
    on: events.on.bind(events),
    subscribeAsync: async () => [],
    publishAsync: async () => {
      if (opts.replyBeforePublishAck) reply()
      await sleep(opts.publishDelayMs ?? 0)
      if (opts.publishError) throw opts.publishError
      if (opts.replyAfterPublishMs !== undefined) setTimeout(reply, opts.replyAfterPublishMs)
      return undefined
    },
    unsubscribeAsync: async (topic: string) => {
      unsubscribed.push(topic)
      if (opts.unsubscribeError) throw opts.unsubscribeError
      return undefined
    },
  }

  return { client, unsubscribed }
}

test("AC-1: a failed publish fails the request and removes the response subscription", async () => {
  const broker = fakeBroker({ publishError: new Error("publish refused") })
  const signer = createSigner(broker.client, undefined, 50)

  await assert.rejects(signer.sendForApproval(REQUEST, "dev1", "req1"), /publish refused/)
  assert.deepEqual(broker.unsubscribed, [RESPONSE_TOPIC])
})

test("AC-2: a failed unsubscribe after the reply still answers with the reply", async () => {
  const broker = fakeBroker({ replyAfterPublishMs: 0, unsubscribeError: new Error("unsubscribe refused") })
  const signer = createSigner(broker.client, undefined, 50)

  assert.deepEqual(await signer.sendForApproval(REQUEST, "dev1", "req1"), { kind: "answered", payload: "030201" })
})

test("AC-3: a reply that arrives before the publish acknowledgement is answered", async () => {
  const broker = fakeBroker({ replyBeforePublishAck: true, publishDelayMs: 20 })
  const signer = createSigner(broker.client, undefined, 50)

  assert.deepEqual(await signer.sendForApproval(REQUEST, "dev1", "req1"), { kind: "answered", payload: "030201" })
})

test("AC-4: no reply within the device timeout times out and removes the response subscription", async () => {
  const broker = fakeBroker()
  const signer = createSigner(broker.client, undefined, 50)

  assert.deepEqual(await signer.sendForApproval(REQUEST, "dev1", "req1"), { kind: "timedOut" })
  assert.deepEqual(broker.unsubscribed, [RESPONSE_TOPIC])
})

test("AC-4n: the device timeout starts at the publish acknowledgement", async () => {
  const broker = fakeBroker({ publishDelayMs: 100, replyAfterPublishMs: 20 })
  const signer = createSigner(broker.client, undefined, 50)

  assert.deepEqual(await signer.sendForApproval(REQUEST, "dev1", "req1"), { kind: "answered", payload: "030201" })
})

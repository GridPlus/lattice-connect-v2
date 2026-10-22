// Stands in for the Lattice1 agent: answers each request with its payload reversed.
const mqtt = require("mqtt")

const delayMs = Number(process.env.AGENT_DELAY_MS ?? 200)

const client = mqtt.connect(process.env.BROKER_URL, {
  username: "agent",
  password: "agent",
  reconnectPeriod: 500,
  reconnectOnConnackError: true,
})

client.on("connect", async () => {
  try {
    await client.subscribeAsync("to_agent/+/request/+", { qos: 1 })
    console.log(`agent subscribed (delay ${delayMs}ms)`)
  } catch (err) {
    console.log(`agent subscribe failed: ${err.message}`)
  }
})

client.on("message", (topic, payload) => {
  const [, deviceId, , requestId] = topic.split("/")
  if (deviceId === "silent") return
  setTimeout(() => {
    client.publish(`from_agent/${deviceId}/response/${requestId}`, Buffer.from(payload).reverse(), { qos: 1 })
  }, delayMs)
})

client.on("error", (err) => console.log(`agent error: ${err.message}`))

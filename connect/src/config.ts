import dotenv from "dotenv"
import { IClientOptions } from "mqtt"

// Later files win, as with `docker run --env-file .env --env-file .direct.env`.
// Workers are forked with the primary's environment, so loading here once is enough.
dotenv.config({ path: ".env", quiet: true })
dotenv.config({ path: ".direct.env", override: true, quiet: true })

export const appConfig = {
  port: process.env.APP_SERVICE_PORT,
  workers: process.env.APP_WORKER_COUNT,
}

/** Connection options for the broker on the Lattice1. Throws if the device host is not a URL. */
export function brokerOptions(): IClientOptions {
  const port = process.env.MQTT_HTTP_PORT
  return {
    host: new URL(`${process.env.ADMIN_CLIENT_HOST}`).hostname,
    port: parseInt(`${port}`),
    protocol: port === "8883" ? "mqtts" : "mqtt",
    username: process.env.ADMIN_CLIENT_USER,
    password: process.env.ADMIN_CLIENT_PASS,
  }
}

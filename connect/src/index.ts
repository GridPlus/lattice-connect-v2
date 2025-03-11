import { startService } from "./core"
import { useProvision } from "./services/useProvision"
import { useSigning } from "./services/useSigning"
import { useEIP1193Provider } from "./services/useEIP1193Provider"

require('dotenv').config()

const services = [useEIP1193Provider, useSigning]
if (process.env.ADMIN_CLIENT_HOST) {
  services.push(useProvision)
}

startService({
  port: process.env.APP_SERVICE_PORT,
  workers: process.env.APP_WORKER_COUNT
}, services)
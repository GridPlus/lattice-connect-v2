import { startService } from "./core"
import { useProvision } from "./services/useProvision"
import { useSigning } from "./services/useSigning"

require('dotenv').config({ quiet: true })

startService({
  port: process.env.APP_SERVICE_PORT,
  workers: process.env.APP_WORKER_COUNT
}, [useProvision, useSigning])
import cluster from "cluster"
import { startService } from "./core"
import { useSigning } from "./services/useSigning"

if (cluster.isPrimary) {
  require('dotenv').config({ debug: true, override: true, path: '.direct.env', quiet: true })
}

startService({
  port: process.env.APP_SERVICE_PORT,
  workers: process.env.APP_WORKER_COUNT
}, [useSigning])

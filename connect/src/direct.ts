import { appConfig } from "./config"
import { spawn } from "./core/spawnWorker"
import { startServer } from "./core/startServer"
import { useSigning } from "./services/useSigning"

spawn({
  upTo: appConfig.workers,
  worker: worker => startServer(worker, appConfig.port, useSigning).catch(err => {
    console.error(err)
    process.exit(1)
  })
})

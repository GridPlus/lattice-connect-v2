import { IApp, IAppConfig } from "./createApp"
import { startServer } from "./startServer"
import { spawn } from "./spawnWorker"
import { Worker } from "cluster";

export interface IAppService {
  app: IApp,
  logger: any
}

export function startService(config: IAppConfig, useService: ((service: IAppService) => void)[]) {
  spawn({
    upTo: config.workers,
    worker: (worker: Worker) => {
      startServer({
        worker,
        config
      })
        .then(server => useService.forEach(service => service(server)))
        .catch((err: any) => {
          console.error(err)
          process.exit(1)
        })
    }
  })
}
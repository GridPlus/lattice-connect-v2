import http from "http";
import { Worker } from "cluster";
import { createApp, IAppConfig } from "./createApp";
import type { IAppService } from ".";

export async function startServer({ worker, config }: {
  worker: Worker,
  config: IAppConfig
}): Promise<IAppService> {
  //----------------------------------------------------------------------------------
  // APP: Port
  //----------------------------------------------------------------------------------
  const port = config.port

  /**
   * This Promise creates a server from an already instantiated Express 'app', and
   * then starts listening on 'port'.
   * 
   * It resolves once it begins listening; it rejects once 'server' receives its
   * first (and only) error, at which time the 'server' calls 'close()'.
   */
  const createServer = ({ app, logger }: IAppService) => {
    return new Promise<IAppService>((resolve, rejected) => {
      //------------------------------------------------------------------------------
      // HTTP: Create 'Server'
      //------------------------------------------------------------------------------
      const server = http.createServer(app).listen(port)

      //------------------------------------------------------------------------------
      // EVENT: 'Listening'
      //------------------------------------------------------------------------------
      server.on('listening', () => {
        logger.info(`Worker ${worker.id}: listening on: ${port}`)
        resolve({ app, logger })
      })

      //------------------------------------------------------------------------------
      // EVENT: 'Close'
      //------------------------------------------------------------------------------
      server.on('close', async () => {
        logger.info(`Worker ${worker.id}: closing...`)
      })

      //------------------------------------------------------------------------------
      // EVENT: 'Error'
      //------------------------------------------------------------------------------
      server.on('error', (err) => {
        server.close()
        rejected(err)
      })
    })
  }

  //----------------------------------------------------------------------------------
  // SERVER: Create 'App'; Create 'Server'
  //----------------------------------------------------------------------------------
  return createApp(config).then(createServer)
}
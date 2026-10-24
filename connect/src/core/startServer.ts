import http from "http";
import express from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { Worker } from "cluster";
import type { IAppService } from ".";

/**
 * Starts this worker's HTTP server with the routes that 'addRoutes' registers.
 *
 * Resolves once the server is listening; rejects on the server's first (and only)
 * error, at which time the server is closed.
 */
export function startServer(worker: Worker, port: string | undefined, addRoutes: (service: IAppService) => void): Promise<void> {
  const httpLogger = pinoHttp()
  const logger = httpLogger.logger
  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use(httpLogger)
  app.get("/", (_, res) => {
    res.sendStatus(200)
  })
  addRoutes({ app, logger })

  return new Promise((resolve, reject) => {
    const server = http.createServer(app).listen(port)

    server.on('listening', () => {
      logger.info(`Worker ${worker.id}: listening on: ${port}`)
      resolve()
    })

    server.on('close', () => {
      logger.info(`Worker ${worker.id}: closing...`)
    })

    server.on('error', (err) => {
      server.close()
      reject(err)
    })
  })
}

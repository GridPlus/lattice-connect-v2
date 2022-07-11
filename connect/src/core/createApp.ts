import pino, { Options } from "express-pino-logger";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

type App = ReturnType<typeof express>

export interface IAppConfig {
  logging?: Options,
  port?: number | string,
  workers?: number | string
}

export interface IApp extends App {
  config?: IAppConfig
}

/**
 * Creates an 'Express' instance.
 * 
 * @param config The object that defines specific features of our app instance.
 * @returns An 'app' & 'logger' which is associated with the app.
 */
export function createApp(config: IAppConfig): Promise<{ app: IApp, logger: any }> {
  //----------------------------------------------------------------------------
  // APP: Create
  //----------------------------------------------------------------------------
  const app: IApp = express();
  const logger = pino(config.logging)

  //----------------------------------------------------------------------------
  // APP: Setup
  //----------------------------------------------------------------------------
  app.use(cors());
  app.use(bodyParser.json());
  app.use(logger)

  //----------------------------------------------------------------------------
  // GET: "/"
  //----------------------------------------------------------------------------
  app.get("/", async (_, res) => {
    res.sendStatus(200)
  })

  //@ts-ignore
  app.config = config

  return Promise.resolve({ app, logger: logger.logger })
}
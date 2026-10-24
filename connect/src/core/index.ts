import type { Express } from "express"

export interface Logger {
  info: (...args: unknown[]) => void
}

export interface IAppService {
  app: Express,
  logger: Logger
}

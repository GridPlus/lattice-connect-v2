import { Application } from 'express';
import { Server } from 'http';

export interface IApp extends Application {
  server: Server;
}

export interface ILogger {
  info: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

export interface IAppService {
  app: IApp;
  logger: ILogger;
}
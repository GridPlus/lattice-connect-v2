import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import pino from 'express-pino-logger';
import routes from './routes';
import cluster from 'cluster';
import os from 'os';
import http from 'http';
import { initializeWebSocketServer } from './middleware/websocket';
import { useSigning } from './legacy/useSigning';

// Load environment variables
dotenv.config();

// App constants
const PORT = process.env.APP_SERVICE_PORT || 3000;
const NUM_WORKERS = parseInt(process.env.APP_WORKER_COUNT || '1', 10);

// Initialize cluster workers
if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

  // Fork workers based on configuration
  const numWorkers = Math.min(NUM_WORKERS, os.cpus().length);
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // Create Express app
  const app = express();
  const logger = pino();

  // Apply middlewares
  app.use(cors());
  app.use(bodyParser.json());
  app.use(logger);

  // Base health check endpoint
  app.get('/', (_, res) => {
    res.sendStatus(200);
  });

  // Status endpoint for health checks
  app.get('/status', (_, res) => {
    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      workerId: cluster.worker?.id,
    });
  });

  // Create HTTP server (must be before routes are registered)
  const server = http.createServer(app);

  // Setup the app with server for legacy compatibility
  const appService = {
    app,
    logger: console,
    server,
  };

  // Initialize Legacy Signing for backward compatibility
  // This should be done before registering other routes to ensure proper request handling
  useSigning(appService).catch((err) => {
    console.error('Failed to initialize legacy signing service:', err);
  });

  // Register all v2 routes
  app.use(routes);

  // Initialize WebSocket server if needed
  if (process.env.ADMIN_CLIENT_HOST) {
    initializeWebSocketServer(server);
  }

  // Start the server
  server.listen(PORT, () => {
    console.log(`Worker ${cluster.worker?.id} listening on port ${PORT}`);
  });
}

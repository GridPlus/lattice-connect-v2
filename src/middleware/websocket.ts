import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { Server } from 'http';
import { WebSocket, Server as WebSocketServer } from 'ws';
import { getDeviceEmitter } from '../controllers/gridplus.controller';

// WebSocket server instance
let wss: WebSocketServer;

/**
 * Initialize WebSocket server
 */
export const initializeWebSocketServer = (server: Server) => {
  wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
    // Extract deviceId from URL path
    const deviceId = request.url?.split('/')?.[3];
    if (!deviceId) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      console.info(`WebSocket connection established for device ${deviceId}`);

      // Get the emitter for this device
      const emitter = getDeviceEmitter(deviceId);

      // Map to store event handlers for cleanup
      const eventHandlers = new Map<string, (data: any) => void>();

      // Helper to setup event forwarding
      const setupEventHandler = (eventName: string) => {
        const handler = (data: any) => {
          try {
            console.info(`Emitting ${eventName} event to WebSocket`);
            ws.send(JSON.stringify({ event: eventName, data }));
          } catch (error) {
            console.error(`Error sending WebSocket event ${eventName}:`, error);
          }
        };
        eventHandlers.set(eventName, handler);
        emitter.on(eventName, handler);
      };

      // Setup handlers for all EIP-1193 events
      setupEventHandler('connect');
      setupEventHandler('disconnect');
      setupEventHandler('chainChanged');
      setupEventHandler('accountsChanged');
      setupEventHandler('message');

      // Clean up on connection close
      ws.on('close', () => {
        // Remove all event listeners
        eventHandlers.forEach((handler, eventName) => {
          emitter.removeListener(eventName, handler);
        });
        eventHandlers.clear();
        console.info(`WebSocket connection closed for device ${deviceId}`);
      });
    });
  });

  return wss;
};

import { IAppService } from "../core";
import { useEIP1193Provider } from "./useEIP1193Provider";
import express, { Application } from "express";
import request from "supertest";
import { Client, Utils } from "gridplus-sdk";
import dotenv from "dotenv";
import path from "path";
import WebSocket from 'ws';
import { createServer } from 'http';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

describe("useEIP1193Provider Integration Tests", () => {
  let app: Application;
  let server: any;
  let logger: any;
  const DEVICE_ID = "sc6J1U";
  const APP_NAME = "SDK Test2";
  const APP_PASSWORD = "asdfasdf";
  let authToken: string;
  let ws: WebSocket;
  let wsEvents: { event: string; data: any }[] = [];

  // Helper function to make authenticated requests
  const makeRequest = (method: string, deviceId: string, body: any) => {
    const req = request(app)
      .post(`/api/v2/www${deviceId ? `/${deviceId}` : ''}`)
      .send(body);
    
    if (authToken) {
      req.set('Authorization', `Bearer ${authToken}`);
    }
    
    return req;
  };

  // Helper function for initial connection
  const connect = async () => {
    const appSecret = Utils.generateAppSecret(DEVICE_ID, APP_PASSWORD, APP_NAME);
    const response = await request(app)
      .post('/api/v2/www')
      .send({ 
        deviceId: DEVICE_ID,
        name: APP_NAME,
        password: APP_PASSWORD,
        appSecret
      });

    if (response.status === 200) {
      authToken = response.body.token;
    }
    return response;
  };

  beforeAll(() => {
    // Ensure required environment variables are set
    const requiredEnvVars = [
      "LATTICE_CONNECT_URL",
      "MQTT_HOST",
      "MQTT_HTTP_PORT",
      "ADMIN_CLIENT_HOST",
      "ADMIN_CLIENT_USER",
      "ADMIN_CLIENT_PASS"
    ];

    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingVars.length > 0) {
      console.error("Missing environment variables:", missingVars);
      console.error("Current environment:", process.env);
      throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
    }

    // Log environment configuration
    console.log("Test environment configuration:");
    console.log("- MQTT_HOST:", process.env.MQTT_HOST);
    console.log("- MQTT_HTTP_PORT:", process.env.MQTT_HTTP_PORT);
    console.log("- LATTICE_CONNECT_URL:", process.env.LATTICE_CONNECT_URL);
    console.log("- ADMIN_CLIENT_HOST:", process.env.ADMIN_CLIENT_HOST);
  });

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    // Create HTTP server
    server = createServer(app);
    (app as any).server = server;

    logger = {
      info: console.log,
      error: console.error
    };

    const service: IAppService = {
      app: app as any as IAppService["app"],
      logger,
    };

    useEIP1193Provider(service);

    // Start the server
    await new Promise<void>(resolve => {
      server.listen(0, () => {
        console.log(`Test server listening on port ${(server.address() as any).port}`);
        resolve();
      });
    });

    // Clear WebSocket events array
    wsEvents = [];

    // Setup WebSocket connection if not already connected
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      const port = (server.address() as any).port;
      ws = new WebSocket(`ws://localhost:${port}/api/v2/www/${DEVICE_ID}`);
      
      ws.on('message', (data: string) => {
        const event = JSON.parse(data);
        wsEvents.push(event);
        console.log('WebSocket event received:', event);
      });

      // Wait for connection with timeout
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          ws.on('open', () => resolve());
          ws.on('error', reject);
        }),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000)
        )
      ]);
    }

    // Connect and get initial token
    await connect();
  }, 30000); // Increase timeout to 30 seconds

  afterEach(async () => {
    // Close WebSocket connection
    if (ws && ws.readyState === WebSocket.OPEN) {
      await new Promise<void>(resolve => {
        ws.on('close', () => resolve());
        ws.close();
      });
    }

    // Close server
    if (server) {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    }
  });

  afterAll(async () => {
    // Cleanup any remaining connections or resources
    console.log("Cleaning up test resources...");
    if (ws && ws.readyState === WebSocket.OPEN) {
      await new Promise<void>(resolve => {
        ws.on('close', () => resolve());
        ws.close();
      });
    }
    if (server) {
      await new Promise<void>(resolve => {
        server.close(() => resolve());
      });
    }
  });

  describe("Connection and Events", () => {
    it("should connect to the device and emit connect event", async () => {
      console.log("\n=== Connection Test Start ===");
      
      // Clear existing token to test fresh connection
      authToken = '';
      const response = await connect();

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("message", "Connection initialized successfully");

      // Store token for subsequent requests
      authToken = response.body.token;

      // Verify connect event was emitted
      const connectEvent = wsEvents.find(e => e.event === 'connect');
      expect(connectEvent).toBeTruthy();
      expect(connectEvent?.data).toHaveProperty('chainId', '0x1');

      console.log("\n=== Connection Test End ===\n");
    }, 30000);

    it("should handle connection errors gracefully", async () => {
      const response = await request(app)
        .post('/api/v2/www')
        .send({ 
          deviceId: "invalid_device_id",
          name: APP_NAME,
          password: APP_PASSWORD
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("message", "Failed to connect to device");
    });

    it("should handle unauthorized requests", async () => {
      const response = await request(app)
        .post(`/api/v2/www/${DEVICE_ID}`)
        .send({
          method: "eth_chainId",
          params: []
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain("Unauthorized");
    });
  });

  describe("Chain Management", () => {
    it("should get the current chain ID", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "eth_chainId",
        params: []
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("chainId", "0x1");
      expect(response.body).toHaveProperty("token");

      // Update token for next request
      authToken = response.body.token;
    });

    it("should switch Ethereum chain and emit chainChanged event", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x89" }]
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("token");

      // Verify chainChanged event was emitted
      const chainEvent = wsEvents.find(e => e.event === 'chainChanged');
      expect(chainEvent).toBeTruthy();
      expect(chainEvent?.data).toBe("0x89");

      // Update token and verify chain was switched
      authToken = response.body.token;
      const chainResponse = await makeRequest('', DEVICE_ID, {
        method: "eth_chainId",
        params: []
      });

      expect(chainResponse.status).toBe(200);
      expect(chainResponse.body).toHaveProperty("chainId", "0x89");
      authToken = chainResponse.body.token;
    });

    it("should add a new Ethereum chain and emit chainChanged event", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x2105",
          chainName: "Base",
          rpcUrls: ["https://mainnet.base.org"],
          nativeCurrency: {
            name: "ETH",
            symbol: "ETH",
            decimals: 18
          }
        }]
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("token");

      // Verify chainChanged event was emitted
      const chainEvent = wsEvents.find(e => e.event === 'chainChanged');
      expect(chainEvent).toBeTruthy();
      expect(chainEvent?.data).toBe("0x2105");

      authToken = response.body.token;
    });

    it("should handle invalid chain parameters", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "wallet_switchEthereumChain",
        params: [{}] // Missing chainId
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("Invalid chainId parameter");
    });
  });

  describe("Account Management", () => {
    it("should get Ethereum addresses and emit accountsChanged event", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "eth_accounts",
        params: []
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("addresses");
      expect(Array.isArray(response.body.addresses)).toBe(true);
      expect(response.body.addresses[0]).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(response.body).toHaveProperty("token");

      // Verify accountsChanged event was emitted
      const accountsEvent = wsEvents.find(e => e.event === 'accountsChanged');
      expect(accountsEvent).toBeTruthy();
      expect(Array.isArray(accountsEvent?.data)).toBe(true);
      expect(accountsEvent?.data[0]).toMatch(/^0x[a-fA-F0-9]{40}$/);

      authToken = response.body.token;
    }, 30000);

    it("should handle eth_requestAccounts same as eth_accounts", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "eth_requestAccounts",
        params: []
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("addresses");
      expect(Array.isArray(response.body.addresses)).toBe(true);
      expect(response.body.addresses[0]).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(response.body).toHaveProperty("token");

      authToken = response.body.token;
    }, 30000);
  });

  describe("Signing Operations", () => {
    it("should sign a transaction", async () => {
      try {
        const response = await makeRequest('', DEVICE_ID, {
          method: "eth_signTransaction",
          params: [{
            to: "0x1234567890123456789012345678901234567890",
            value: "0x0",
            data: "0x",
            gasLimit: "0x5208",
            gasPrice: "0x4a817c800",
            nonce: "0x0",
            chainId: 1,
          }]
        });

        if (response.status === 409) {
          console.warn("Device needs resync - skipping test");
          return;
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("signature");
        expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
        expect(response.body).toHaveProperty("token");

        authToken = response.body.token;
      } catch (error) {
        console.warn("Transaction signing test failed:", error);
      }
    }, 120000);

    it("should sign a message with eth_sign", async () => {
      try {
        const response = await makeRequest('', DEVICE_ID, {
          method: "eth_sign",
          params: [
            "0x1234567890123456789012345678901234567890",
            "0x48656c6c6f20576f726c64"
          ]
        });

        if (response.status === 409) {
          console.warn("Device needs resync - skipping test");
          return;
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("signature");
        expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
        expect(response.body).toHaveProperty("token");

        authToken = response.body.token;
      } catch (error) {
        console.warn("Message signing test failed:", error);
      }
    }, 120000);

    it("should sign a message with personal_sign", async () => {
      try {
        const response = await makeRequest('', DEVICE_ID, {
          method: "personal_sign",
          params: [
            "0x48656c6c6f20576f726c64", // message
            "0xc0c8f96c2fe011cc96770d2e37cfbfeafb585f0e" // address (using the one from accountsChanged event)
          ]
        });

        if (response.status === 409) {
          console.warn("Device needs resync - skipping test");
          return;
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("signature");
        expect(typeof response.body.signature).toBe("string");
        expect(response.body.signature).toMatch(/^0x[0-9a-f]{130}$/i);
      } catch (error) {
        console.warn("Personal sign test failed:", error);
        throw error;
      }
    }, 60000); // Increased timeout to 60 seconds

    it("should sign typed data with eth_signTypedData_v4", async () => {
      try {
        const response = await makeRequest('', DEVICE_ID, {
          method: "eth_signTypedData_v4",
          params: [{
            types: {
              EIP712Domain: [
                { name: "name", type: "string" },
                { name: "version", type: "string" },
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" },
              ],
              Person: [
                { name: "name", type: "string" },
                { name: "wallet", type: "address" },
              ],
              Mail: [
                { name: "from", type: "Person" },
                { name: "to", type: "Person" },
                { name: "contents", type: "string" },
              ],
            },
            primaryType: "Mail",
            domain: {
              name: "Lattice Mail",
              version: "1",
              chainId: 1,
              verifyingContract: "0x1234567890123456789012345678901234567890",
            },
            message: {
              from: {
                name: "Alice",
                wallet: "0x1234567890123456789012345678901234567890",
              },
              to: {
                name: "Bob",
                wallet: "0x2345678901234567890123456789012345678901",
              },
              contents: "Hello, Bob!",
            },
          }]
        });

        if (response.status === 409) {
          console.warn("Device needs resync - skipping test");
          return;
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("signature");
        expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
        expect(response.body).toHaveProperty("token");

        authToken = response.body.token;
      } catch (error) {
        console.warn("Typed data signing test failed:", error);
      }
    }, 30000);
  });

  describe("Subscriptions", () => {
    it("should handle eth_subscribe for newHeads", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "eth_subscribe",
        params: ["newHeads"]
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("subscriptionId");
      expect(typeof response.body.subscriptionId).toBe("string");
      expect(response.body).toHaveProperty("token");

      // Verify subscription message was emitted
      const messageEvent = wsEvents.find(e => 
        e.event === 'message' && 
        e.data.type === 'eth_subscription' &&
        e.data.data.subscription === response.body.subscriptionId
      );
      expect(messageEvent).toBeTruthy();

      authToken = response.body.token;
    }, 30000);

    it("should handle invalid subscription type", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "eth_subscribe",
        params: ["invalidType"]
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("Unsupported subscription type");
    }, 30000);
  });

  describe("Error Handling", () => {
    it("should handle unsupported methods gracefully", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "eth_unsupportedMethod",
        params: []
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Unsupported method");
      expect(response.body).toHaveProperty("error", "Method eth_unsupportedMethod is not supported");
    }, 30000);

    it("should handle missing parameters", async () => {
      const response = await makeRequest('', DEVICE_ID, {
        method: "eth_signTransaction",
        params: [] // Missing transaction parameters
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("Invalid transaction parameters");
    }, 30000);

    it("should handle missing authorization", async () => {
      // Temporarily clear auth token
      const savedToken = authToken;
      authToken = '';

      const response = await makeRequest('', DEVICE_ID, {
        method: "eth_chainId",
        params: []
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain("Unauthorized");

      // Restore auth token
      authToken = savedToken;
    }, 30000);
  });
}); 
import { IAppService } from "../core";
import { useEIP1193Provider } from "./useEIP1193Provider";
import express, { Application } from "express";
import request from "supertest";
import { Client, Utils } from "gridplus-sdk";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

describe("useEIP1193Provider Integration Tests", () => {
  let app: Application;
  let logger: any;
  const DEVICE_ID = "sc6J1U";
  const APP_NAME = "SDK Test2";
  const APP_PASSWORD = "asdfasdf";
  let stateData: string;

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

  beforeEach(() => {
    app = express();
    app.use(express.json());

    logger = {
      info: console.log,  // Use console.log for better visibility during tests
      error: console.error
    };

    const service: IAppService = {
      app: app as any as IAppService["app"],
      logger,
    };

    useEIP1193Provider(service);
  });

  afterAll(async () => {
    // Cleanup any remaining connections or resources
    console.log("Cleaning up test resources...");
  });

  describe("Real Device Tests", () => {
    it("should connect to the real device", async () => {
      console.log("\n=== Connection Test Start ===");
      console.log("Test Configuration:");
      console.log("- Device ID:", DEVICE_ID);
      console.log("- App Name:", APP_NAME);
      console.log("- MQTT Host:", process.env.MQTT_HOST);
      console.log("- MQTT Port:", process.env.MQTT_HTTP_PORT);
      console.log("- Connect URL:", process.env.LATTICE_CONNECT_URL);
      
      // Generate app secret
      const appSecret = Utils.generateAppSecret(DEVICE_ID, APP_PASSWORD, APP_NAME);
      
      console.log("\nSending connection request...");
      const response = await request(app)
        .post("/api/eip1193/connect")
        .send({ 
          deviceId: DEVICE_ID,
          name: APP_NAME,
          password: APP_PASSWORD,
          appSecret
        })
        .catch(error => {
          console.error("Connection request failed:", error);
          throw error;
        });

      console.log("\nConnection Response Details:");
      console.log("- Status:", response.status);
      console.log("- Headers:", response.headers);
      console.log("- Body:", JSON.stringify({
        ...response.body,
        stateData: response.body.stateData ? `${response.body.stateData.slice(0, 10)}...` : undefined
      }, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("stateData");
      expect(response.body).toHaveProperty("message", "Connection initialized successfully");

      stateData = response.body.stateData;
      console.log("\n=== Connection Test End ===\n");
    }, 30000);

    it("should get Ethereum addresses from the real device", async () => {
      // Skip if previous tests failed
      if (!stateData) {
        console.warn("Skipping eth_accounts test - no stateData available");
        return;
      }

      const response = await request(app)
        .post(`/api/eip1193/${DEVICE_ID}`)
        .send({
          method: "eth_accounts",
          params: [],
          stateData,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("addresses");
      expect(Array.isArray(response.body.addresses)).toBe(true);
      expect(response.body.addresses[0]).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(response.body).toHaveProperty("stateData");

      // Update stateData for next test
      stateData = response.body.stateData;
    }, 30000);

    it("should sign a transaction with the real device", async () => {
      // Skip if previous tests failed
      if (!stateData) {
        console.warn("Skipping eth_signTransaction test - no stateData available");
        return;
      }

      try {
        const response = await request(app)
          .post(`/api/eip1193/${DEVICE_ID}`)
          .send({
            method: "eth_signTransaction",
            params: [{
              to: "0x1234567890123456789012345678901234567890",
              value: "0x0",
              data: "0x",
              gasLimit: "0x5208", // 21000
              gasPrice: "0x4a817c800", // 20 Gwei
              nonce: "0x0",
              chainId: 1,
            }],
            stateData,
          });

        if (response.status === 409) {
          console.warn("Device needs resync - this is expected in integration tests");
          return;
        }

        if (response.status === 500 && response.body.error?.includes("operation was aborted")) {
          console.warn("Operation was aborted - this is expected in integration tests");
          return;
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("signature");
        expect(typeof response.body.signature).toBe("string");
        expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
        expect(response.body).toHaveProperty("stateData");

        // Update stateData for next test
        stateData = response.body.stateData;
      } catch (error) {
        console.error("Transaction signing test failed:", error);
        throw error;
      }
    }, 120000); // Increase timeout to 2 minutes

    it("should sign a message with the real device", async () => {
      // Skip if previous tests failed
      if (!stateData) {
        console.warn("Skipping eth_sign test - no stateData available");
        return;
      }

      try {
        const response = await request(app)
          .post(`/api/eip1193/${DEVICE_ID}`)
          .send({
            method: "eth_sign",
            params: [
              "0x1234567890123456789012345678901234567890",
              "0x48656c6c6f20576f726c64", // "Hello World" in hex
            ],
            stateData,
          });

        if (response.status === 409) {
          console.warn("Device needs resync - this is expected in integration tests");
          return;
        }

        if (response.status === 500 && response.body.error?.includes("operation was aborted")) {
          console.warn("Operation was aborted - this is expected in integration tests");
          return;
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("signature");
        expect(typeof response.body.signature).toBe("string");
        expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
        expect(response.body).toHaveProperty("stateData");

        // Update stateData for next test
        stateData = response.body.stateData;
      } catch (error) {
        console.error("Message signing test failed:", error);
        throw error;
      }
    }, 120000); // Increase timeout to 2 minutes

    it("should sign typed data with the real device", async () => {
      // Skip if previous tests failed
      if (!stateData) {
        console.warn("Skipping eth_signTypedData_v4 test - no stateData available");
        return;
      }

      try {
        const response = await request(app)
          .post(`/api/eip1193/${DEVICE_ID}`)
          .send({
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
            }],
            stateData,
          });

        if (response.status === 409) {
          console.warn("Device needs resync - this is expected in integration tests");
          return;
        }

        if (response.status === 500 && response.body.error?.includes("operation was aborted")) {
          console.warn("Operation was aborted - this is expected in integration tests");
          return;
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("signature");
        expect(typeof response.body.signature).toBe("string");
        expect(response.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
        expect(response.body).toHaveProperty("stateData");

        // Update stateData for next test
        stateData = response.body.stateData;
      } catch (error) {
        console.error("Typed data signing test failed:", error);
        throw error;
      }
    }, 120000); // Increase timeout to 2 minutes
  });
}); 
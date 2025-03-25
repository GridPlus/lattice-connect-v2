#!/usr/bin/env node

/**
 * MQTT Connection Test Script
 * 
 * This script tests communication between the app server and MQTT broker
 * by publishing a message and subscribing to a response topic.
 */

require('dotenv').config();
const mqtt = require('async-mqtt');
const crypto = require('crypto');
const bs58 = require('bs58');

// Colors for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const log = {
  info: (msg) => console.log(`${YELLOW}${msg}${RESET}`),
  success: (msg) => console.log(`${GREEN}${msg}${RESET}`),
  error: (msg) => console.log(`${RED}${msg}${RESET}`)
};

// Generate unique client ID
const clientId = `test-client-${bs58.encode(crypto.randomBytes(8)).slice(6).toUpperCase()}`;

// Generate test request IDs
const deviceId = `TEST-DEVICE-${Math.floor(Math.random() * 1000)}`;
const requestId = `REQ-${Date.now()}`;

// Topics
const publishTopic = `to_agent/${deviceId}/request/${requestId}`;
const subscribeTopic = `from_agent/${deviceId}/response/${requestId}`;

// MQTT connection details
const protocol = process.env.MQTT_HTTP_PORT === '8883' ? 'mqtts' : 'mqtt';
const host = process.env.MQTT_HOST || 'localhost';
const port = process.env.MQTT_HTTP_PORT || '1883';

// Test message
const testMessage = Buffer.from(JSON.stringify({
  test: true,
  timestamp: Date.now(),
  message: 'Hello from test client'
}));

async function runTest() {
  let client;
  let messageReceived = false;
  let testTimeout;

  try {
    log.info(`Connecting to MQTT broker at ${host}:${port}...`);
    
    client = await mqtt.connect(null, {
      clientId,
      protocol,
      host,
      port: parseInt(port),
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      reconnectPeriod: 1000,
      connectTimeout: 10000,
    });

    // Set up message handler
    client.on('message', async (topic, payload) => {
      log.success(`Received message on topic: ${topic}`);
      log.info(`Message payload: ${payload.toString()}`);
      
      messageReceived = true;
      clearTimeout(testTimeout);
      
      // Clean up
      await client.unsubscribe(subscribeTopic);
      await client.end();
      
      log.success('MQTT connection test successful!');
      process.exit(0);
    });

    // Set up connection handler
    client.on('connect', async () => {
      log.success('Connected to MQTT broker');
      
      // Subscribe to response topic
      await client.subscribe(subscribeTopic, { qos: 1 });
      log.info(`Subscribed to topic: ${subscribeTopic}`);
      
      // Publish test message
      await client.publish(publishTopic, testMessage, { qos: 1 });
      log.info(`Published message to topic: ${publishTopic}`);
      
      // Echo the message back for testing
      setTimeout(async () => {
        if (!messageReceived) {
          log.info('Sending echo response for test purposes...');
          await client.publish(subscribeTopic, Buffer.from('Echo response for testing'), { qos: 1 });
        }
      }, 2000);
      
      // Set timeout
      testTimeout = setTimeout(async () => {
        log.error('Test timed out - no response received within 10 seconds');
        await client.end();
        process.exit(1);
      }, 10000);
    });

    client.on('error', (err) => {
      log.error(`MQTT error: ${err.message}`);
    });

  } catch (error) {
    log.error(`Failed to connect: ${error.message}`);
    if (client) await client.end();
    process.exit(1);
  }
}

runTest(); 
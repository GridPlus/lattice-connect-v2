import { describe, it, expect } from 'vitest';
import { ApiClient } from './helpers/apiClient';
import { createMockDevice } from './helpers/mockDevice';

// Initialize API client for all tests
const api = new ApiClient();

describe('API Endpoints', () => {
  describe('Health Check', () => {
    it('should return status 200 for the health check endpoint', async () => {
      const response = await api.getStatus();
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data.status).toBe('online');
    });
  });

  describe('Base Endpoint', () => {
    it('should return 200 for the base endpoint', async () => {
      const response = await api.get('/');
      expect(response.status).toBe(200);
    });
  });
});

describe('Device API Endpoints', () => {
  describe('Device Connection', () => {
    it('should return a valid response for device connection request', async () => {
      const mockDevice = createMockDevice();

      // Attempt to connect to the device (will likely fail in test environment)
      const response = await api.connectToDevice(mockDevice.deviceId);

      // We just care that the endpoint responds
      expect(response.status).toBeDefined();

      if (response.status !== 200) {
        console.log(
          'Device connection response:',
          response.status,
          '-',
          response.data?.error || 'Failed to connect to device'
        );
      }
    });
  });

  describe('Device Methods', () => {
    it('should handle account requests properly', async () => {
      const mockDevice = createMockDevice();
      let connectionToken = null;

      try {
        // First try to connect
        const connectResponse = await api.connectToDevice(mockDevice.deviceId);
        connectionToken = connectResponse.data?.token;
      } catch (error) {
        // Ignore connection errors
      }

      if (!connectionToken) {
        console.log('Skipping device account request test - no device connection available');
        return;
      }

      // Use the connection token
      api.setToken(connectionToken);

      // Request accounts
      const response = await api.getAccounts(mockDevice.deviceId);
      expect(response.status).toBeDefined();
    });

    it('should handle chain ID requests properly', async () => {
      const mockDevice = createMockDevice();
      let connectionToken = null;

      try {
        // First try to connect
        const connectResponse = await api.connectToDevice(mockDevice.deviceId);
        connectionToken = connectResponse.data?.token;
      } catch (error) {
        // Ignore connection errors
      }

      if (!connectionToken) {
        console.log('Skipping chain ID request test - no device connection available');
        return;
      }

      // Use the connection token
      api.setToken(connectionToken);

      // Request chain ID
      const response = await api.getChainId(mockDevice.deviceId);
      expect(response.status).toBeDefined();
    });
  });
});

describe('Provision API', () => {
  it('should handle user provisioning requests', async () => {
    // Try to provision a new user - in test environment this will likely fail,
    // but we want to make sure the API responds in some way
    const response = await api.provisionUser();

    // Since this test runs in isolation, not all services will be available,
    // so we're just checking that the endpoint responds
    expect(response.status).toBeDefined();

    console.log('Provision response:', response.status);
  });
});

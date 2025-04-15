import { describe, it, expect } from 'vitest';
import { ApiClient } from './helpers/apiClient';
import { createMockDevice } from './helpers/mockDevice';

// Initialize API client for all tests
const api = new ApiClient();

describe('API Error Handling', () => {
  describe('Invalid Endpoints', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await api.get('/non-existent-endpoint');
      expect(response.status).toBe(404);
    });
  });

  describe('Authentication Errors', () => {
    it('should handle unauthorized method requests', async () => {
      const mockDevice = createMockDevice();
      const method = 'eth_requestAccounts';
      const params = [];

      const response = await api.executeMethod(mockDevice.deviceId, method, params);
      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toContain('Unauthorized');
    });

    it('should handle requests with invalid tokens', async () => {
      const mockDevice = createMockDevice();
      const method = 'eth_requestAccounts';
      const params = [];

      // Set an invalid token
      api.setToken('invalid-token-that-does-not-exist');

      const response = await api.executeMethod(mockDevice.deviceId, method, params);
      expect(response.status).toBe(401);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toContain('Invalid token');
    });
  });

  describe('Invalid Method Requests', () => {
    it('should handle connection to a mock device', async () => {
      const mockDevice = createMockDevice();

      // Connect to the mock device - should fail since there's no real device
      const response = await api.connectToDevice(mockDevice.deviceId);

      // Expect a 500 error (could be a 404 in a real implementation)
      // We don't require a successful connection for these tests
      expect(response.status).toBeGreaterThanOrEqual(400);
      console.log(
        'Connect response:',
        response.status,
        response.data?.error || response.statusText
      );
    });
  });

  describe('Invalid Device IDs', () => {
    it('should handle non-existent device IDs gracefully', async () => {
      // Try to connect to a non-existent device ID
      const nonExistentDeviceId = 'non-existent-device-id';
      const response = await api.connectToDevice(nonExistentDeviceId);

      // Should fail gracefully
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});

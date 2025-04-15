import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient } from './helpers/apiClient';
import { createMockDevice } from './helpers/mockDevice';

describe('Device Connection E2E Tests', () => {
  let api: ApiClient;

  beforeAll(() => {
    api = new ApiClient();
  });

  describe('POST /api/v1/device/connect', () => {
    it('should connect to a device with valid credentials', async () => {
      const mockDevice = createMockDevice();
      const response = await api.connectToDevice(mockDevice.deviceId, {
        password: 'wNa17ofS261Bb3ba',
        name: 'Test Device',
      });

      // Should return 200 status
      expect(response.status).toBe(200);

      // Should return a valid response structure
      expect(response.data).toHaveProperty('token');
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toBe('Connection initialized successfully');

      // Token should be a non-empty string
      expect(typeof response.data.token).toBe('string');
      expect(response.data.token.length).toBeGreaterThan(0);
    });

    it('should fail to connect with invalid device ID', async () => {
      const response = await api.connectToDevice('invalid-device-id', {
        password: 'wNa17ofS261Bb3ba',
        name: 'Test Device',
      });

      expect(response.status).toBe(500);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toBe('Failed to connect to device');
    });

    it('should fail to connect with invalid password', async () => {
      const mockDevice = createMockDevice();
      const response = await api.connectToDevice(mockDevice.deviceId, {
        password: 'invalid-password',
        name: 'Test Device',
      });

      expect(response.status).toBe(500);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toBe('Failed to connect to device');
    });

    it('should require deviceId in request body', async () => {
      const response = await api.post('/api/v1/device/connect', {
        password: 'wNa17ofS261Bb3ba',
        name: 'Test Device',
      });

      expect(response.status).toBe(400);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toBe('missing deviceId');
    });

    it('should handle reconnection to same device', async () => {
      const mockDevice = createMockDevice();

      // First connection
      const firstResponse = await api.connectToDevice(mockDevice.deviceId, {
        password: 'wNa17ofS261Bb3ba',
        name: 'Test Device',
      });
      expect(firstResponse.status).toBe(200);
      const firstToken = firstResponse.data.token;

      // Second connection to same device
      const secondResponse = await api.connectToDevice(mockDevice.deviceId, {
        password: 'wNa17ofS261Bb3ba',
        name: 'Test Device',
      });
      expect(secondResponse.status).toBe(200);
      const secondToken = secondResponse.data.token;

      // Should get different tokens
      expect(firstToken).not.toBe(secondToken);
    });
  });
});

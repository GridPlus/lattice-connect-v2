import { describe, it, expect } from '@jest/globals';
import * as gridplusController from '../../controllers/gridplus.controller';
import { EventEmitter } from 'events';
import { DEFAULT_CHAIN } from '../handlers/types';

describe('GridPlus Provider Unit Tests', () => {
  let logger: any;
  let deviceEmitter: EventEmitter;

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    // Get a device emitter
    deviceEmitter = gridplusController.getDeviceEmitter('test-device-id');
  });

  describe('Provider Initialization', () => {
    it('should provide core functionality', () => {
      expect(gridplusController.generateToken).toBeDefined();
      expect(gridplusController.getStateFromToken).toBeDefined();
      expect(gridplusController.updateStateForToken).toBeDefined();
      expect(gridplusController.getDeviceEmitter).toBeDefined();
      expect(gridplusController.authenticateRequest).toBeDefined();
      expect(gridplusController.initializeMethodClient).toBeDefined();
      expect(gridplusController.connectDevice).toBeDefined();
      expect(gridplusController.handleMethodRequest).toBeDefined();
    });
  });

  describe('Device Emitter', () => {
    it('should allow event subscription and emission', () => {
      const mockHandler = jest.fn();
      const mockData = { chainId: DEFAULT_CHAIN.chainId };

      deviceEmitter.on('connect', mockHandler);
      deviceEmitter.emit('connect', mockData);

      expect(mockHandler).toHaveBeenCalledWith(mockData);
    });

    it('should allow event unsubscription', () => {
      const mockHandler = jest.fn();
      const mockData = { chainId: DEFAULT_CHAIN.chainId };

      deviceEmitter.on('connect', mockHandler);
      deviceEmitter.removeListener('connect', mockHandler);
      deviceEmitter.emit('connect', mockData);

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Token Generation', () => {
    it('should generate unique tokens for different device IDs', () => {
      const token1 = gridplusController.generateToken('device-1');
      const token2 = gridplusController.generateToken('device-2');

      expect(token1).not.toEqual(token2);
      expect(token1.length).toBeGreaterThan(32); // Should be a sufficiently long string
      expect(token2.length).toBeGreaterThan(32);
    });
  });
});

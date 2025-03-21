import { describe, it, expect } from '@jest/globals';
import { IAppService } from '../../core';
import { useGridPlusProvider } from '../GridPlusProvider';
import { EventEmitter } from 'events';
import { DEFAULT_CHAIN } from '../handlers/types';

describe('GridPlusProvider Unit Tests', () => {
  let logger: any;
  let provider: ReturnType<typeof useGridPlusProvider>;

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    const service: IAppService = {
      app: {
        post: jest.fn(),
      } as any,
      logger,
    };

    provider = useGridPlusProvider(service);
  });

  describe('Provider Initialization', () => {
    it('should return a provider with required methods', () => {
      expect(provider).toBeDefined();
      expect(provider.requestHandler).toBeDefined();
      expect(provider.connectHandler).toBeDefined();
      expect(provider.emitter).toBeInstanceOf(EventEmitter);
    });
  });

  describe('Event Emitter', () => {
    it('should allow event subscription and emission', () => {
      const mockHandler = jest.fn();
      const mockData = { chainId: DEFAULT_CHAIN.chainId };

      provider.emitter.on('connect', mockHandler);
      provider.emitter.emit('connect', mockData);

      expect(mockHandler).toHaveBeenCalledWith(mockData);
    });

    it('should allow event unsubscription', () => {
      const mockHandler = jest.fn();
      const mockData = { chainId: DEFAULT_CHAIN.chainId };

      provider.emitter.on('connect', mockHandler);
      provider.emitter.removeListener('connect', mockHandler);
      provider.emitter.emit('connect', mockData);

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Logger Integration', () => {
    it('should use the provided logger', () => {
      const testMessage = 'Test log message';
      const testError = new Error('Test error');

      logger.info(testMessage);
      logger.error(testError);

      expect(logger.info).toHaveBeenCalledWith(testMessage);
      expect(logger.error).toHaveBeenCalledWith(testError);
    });
  });
}); 
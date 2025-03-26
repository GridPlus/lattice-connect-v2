import { randomBytes } from 'crypto';

/**
 * Mock device data for e2e tests
 */
export interface MockDevice {
  deviceId: string;
  name: string;
  addresses?: string[];
  accounts?: string[];
  password?: string;
  appSecret?: string;
  uid?: string;
}

/**
 * Create a mock device for testing
 */
export function createMockDevice(options: Partial<MockDevice> = {}): MockDevice {
  // Generate a random ID if not provided
  const randomId = Buffer.from(randomBytes(4)).toString('hex');
  const deviceId = options.deviceId || `mock-device-${randomId}`;

  return {
    deviceId,
    name: options.name || 'Test Device',
    addresses: options.addresses || [
      '0x1234567890123456789012345678901234567890',
      '0x2345678901234567890123456789012345678901',
    ],
    accounts: options.accounts || [],
    password: options.password || 'testpassword',
    appSecret: options.appSecret,
    uid: options.uid,
  };
}

/**
 * Generate a random signature for testing
 */
export function generateMockSignature(): string {
  const randomHexBytes = () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');

  // Generate r, s, v components of a signature
  const r = Array(32).fill(0).map(randomHexBytes).join('');
  const s = Array(32).fill(0).map(randomHexBytes).join('');
  const v = '1c'; // 1b or 1c

  return '0x' + r + s + v;
}

/**
 * Create a personal_sign message for testing
 */
export function createPersonalSignMessage(message: string): string {
  return '0x' + Buffer.from(message).toString('hex');
}

/**
 * Parse hex string to human-readable text
 */
export function parseHexString(hexString: string): string {
  if (!hexString || !hexString.startsWith('0x')) {
    return '';
  }

  try {
    return Buffer.from(hexString.slice(2), 'hex').toString('utf8');
  } catch (error) {
    return '';
  }
}

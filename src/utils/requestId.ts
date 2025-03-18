import { randomBytes } from 'crypto';

export function generateRequestId(): string {
  return randomBytes(4).toString('hex');
}

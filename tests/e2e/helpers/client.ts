/**
 * Mock Client class for testing
 * Simulates the gridplus-sdk Client class
 */
export class Client {
  name: string;
  privKey: Buffer;
  baseUrl: string;
  timeout: number;
  stateData?: string;

  constructor(params: {
    name: string;
    privKey: Buffer;
    baseUrl?: string;
    timeout?: number;
    stateData?: string;
  }) {
    this.name = params.name;
    this.privKey = params.privKey;
    this.baseUrl = params.baseUrl || '';
    this.timeout = params.timeout || 5000;
    this.stateData = params.stateData;
  }

  /**
   * Mock connect method
   */
  async connect(deviceId: string): Promise<boolean> {
    return true;
  }

  /**
   * Mock get state data
   */
  getStateData(): string {
    return this.stateData || '';
  }

  /**
   * Mock send request method
   */
  async sendRequest(data: any): Promise<Buffer> {
    return Buffer.from('mock response', 'utf8');
  }

  /**
   * Mock pair method
   */
  async pair(pairingCode: string): Promise<void> {
    return;
  }

  /**
   * Mock get addresses method
   */
  async getAddresses(params: any): Promise<string[]> {
    return ['0x1234567890123456789012345678901234567890'];
  }
}

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
// Import test utilities
import { getTestPort } from '../testUtils';

/**
 * API client for e2e tests
 */
export class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseURL?: string) {
    // Get the test port from utilities
    const port = getTestPort();

    // Create the baseURL with the port
    const defaultBaseURL = `http://localhost:${port}`;

    this.client = axios.create({
      baseURL: baseURL || defaultBaseURL,
      timeout: 10000,
      validateStatus: () => true, // Don't throw errors for status codes
    });
  }

  /**
   * Set authorization token for subsequent requests
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Make a GET request
   */
  async get<T = any>(path: string, config: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
    const requestConfig: AxiosRequestConfig = { ...config };
    if (this.token) {
      requestConfig.headers = {
        ...(requestConfig.headers || {}),
        Authorization: `Bearer ${this.token}`,
      };
    }
    return this.client.get<T>(path, requestConfig);
  }

  /**
   * Make a POST request
   */
  async post<T = any>(
    path: string,
    data: any = {},
    config: AxiosRequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    const requestConfig: AxiosRequestConfig = { ...config };
    if (this.token) {
      requestConfig.headers = {
        ...(requestConfig.headers || {}),
        Authorization: `Bearer ${this.token}`,
      };
    }
    return this.client.post<T>(path, data, requestConfig);
  }

  /**
   * Get server status
   */
  async getStatus(): Promise<AxiosResponse<any>> {
    return this.get('/status');
  }

  /**
   * Connect to a device
   */
  async connectToDevice(
    deviceId: string,
    options: { name?: string; password?: string; appSecret?: string } = {}
  ): Promise<AxiosResponse<any>> {
    const response = await this.post('/api/v1/device/connect', {
      deviceId,
      name: options.name || 'E2E Test',
      password: options.password,
      appSecret: options.appSecret,
    });

    if (response.data?.token) {
      this.setToken(response.data.token);
    }

    return response;
  }

  /**
   * Execute a method on the device
   */
  async executeMethod(
    deviceId: string,
    method: string,
    params: any[] = []
  ): Promise<AxiosResponse<any>> {
    return this.post(`/api/v1/device/${deviceId}/method`, {
      method,
      params,
    });
  }

  /**
   * Get accounts from device
   */
  async getAccounts(deviceId: string): Promise<AxiosResponse<any>> {
    return this.executeMethod(deviceId, 'eth_requestAccounts');
  }

  /**
   * Get chain ID
   */
  async getChainId(deviceId: string): Promise<AxiosResponse<any>> {
    return this.executeMethod(deviceId, 'eth_chainId');
  }

  /**
   * Sign a message
   */
  async signPersonalMessage(
    deviceId: string,
    address: string,
    message: string
  ): Promise<AxiosResponse<any>> {
    return this.executeMethod(deviceId, 'personal_sign', [message, address]);
  }

  /**
   * Provision a new user (if ADMIN_CLIENT_HOST is set)
   */
  async provisionUser(): Promise<AxiosResponse<any>> {
    return this.get('/api/v1/provision');
  }
}

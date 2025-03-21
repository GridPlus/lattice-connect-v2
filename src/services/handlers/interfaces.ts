import { Client } from 'gridplus-sdk';
import { MethodParams, StateData } from './types';

export interface ISigningService {
  handleEthSignTransaction(client: Client, params: MethodParams['eth_signTransaction']): Promise<{ signature: string }>;
  handlePersonalSign(client: Client, params: MethodParams['personal_sign'], method: 'eth_sign' | 'personal_sign'): Promise<{ signature: string }>;
  handleSignTypedData(client: Client, params: MethodParams['eth_signTypedData']): Promise<{ signature: string }>;
  handleGetAccounts(client: Client): Promise<{ addresses: string[] }>;
  handleGetChainId(state: StateData): { chainId: string };
  handleEthSubscribe(params: MethodParams['eth_subscribe']): { subscriptionId: string };
} 
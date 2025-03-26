import { Client } from 'gridplus-sdk';
import { StateData } from '../services/handlers/types';

declare global {
  namespace Express {
    export interface Request {
      gridplusClient?: Client;
      deviceStateData?: StateData;
      deviceId?: string;
    }
  }
}

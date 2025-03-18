import { EventEmitter } from 'events';
import { StateData, MethodParams } from './types';

export function handleSwitchEthereumChain(
  params: MethodParams['wallet_switchEthereumChain'],
  state: StateData,
  emitter?: EventEmitter
) {
  const [{ chainId }] = params;
  if (!chainId || typeof chainId !== 'string') {
    throw new Error('Invalid chainId parameter');
  }

  // Update the chain config
  state.chainConfig = {
    ...state.chainConfig,
    chainId,
  };

  // Emit chainChanged
  if (emitter) {
    emitter.emit('chainChanged', chainId);
  }

  return {
    success: true,
  };
}

export function handleRequestPermissions(
  params: MethodParams['wallet_requestPermissions'],
  state: StateData,
  origin?: string
) {
  const [requestedPermissions] = params;
  if (!requestedPermissions || !Array.isArray(Object.keys(requestedPermissions))) {
    throw new Error('Invalid permissions request');
  }

  const newPermissions = [];
  const now = Date.now();

  // Process each requested permission
  for (const [capability, _options] of Object.entries(requestedPermissions)) {
    // Check if permission is already granted
    const existingPermission = state.permissions.find(
      (p) => p.parentCapability === capability && p.invoker === origin
    );

    if (!existingPermission) {
      // Add new permission
      newPermissions.push({
        parentCapability: capability,
        date: now,
        invoker: origin || 'unknown',
      });
    }
  }

  // Update state with new permissions
  state.permissions = [...state.permissions, ...newPermissions];

  return {
    permissions: newPermissions,
  };
}

export function handleGetPermissions(state: StateData, origin?: string) {
  // Return permissions for the current origin
  const originPermissions = state.permissions.filter((p) => p.invoker === origin);

  return {
    permissions: originPermissions,
  };
}

export function handleShowCallStatus(
  params: MethodParams['wallet_showCallStatus'],
  state: StateData
) {
  const [callId] = params;
  if (!callId || typeof callId !== 'string') {
    throw new Error('Invalid call ID');
  }

  const status = state.pendingCalls.get(callId);
  if (!status) {
    throw new Error('Call ID not found');
  }

  // No response needed per spec
  return {};
}

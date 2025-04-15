const API_BASE = 'http://localhost:8080/gridplus';

// Store the current token
let currentToken: string | null = null;

// Set the token from outside the module
export function setToken(token: string | null) {
  currentToken = token;
}

// Get the current token
export function getToken(): string | null {
  return currentToken;
}

// Create headers with authentication if token exists
function createHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }
  return headers;
}

// Process response, extracting token if present
async function processResponse(res: Response) {
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  if (data.token) {
    currentToken = data.token;
  }
  return data;
}

export async function connectDevice(payload: any) {
  const res = await fetch(`${API_BASE}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return processResponse(res);
}

export async function pairDevice(payload: any) {
  const res = await fetch(`${API_BASE}/pair`, {
    method: 'POST',
    headers: createHeaders(),
    body: JSON.stringify(payload),
  });
  return processResponse(res);
}

export async function callDeviceMethod(deviceId: string, payload: any) {
  console.log(`Calling method for device ${deviceId}:`, payload);
  console.log('Using headers:', createHeaders());

  try {
    const res = await fetch(`${API_BASE}/${deviceId}/method`, {
      method: 'POST',
      headers: createHeaders(),
      body: JSON.stringify(payload),
    });

    console.log('Response status:', res.status);
    return processResponse(res);
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
}

export async function provisionUser(payload: any) {
  const res = await fetch(`${API_BASE}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return processResponse(res);
}

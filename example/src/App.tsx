import * as React from 'react';
import { useEffect, useState } from 'react';
import './App.css';
import * as apiClient from './apiClient';

// Default API base URL
const API_BASE = 'http://localhost:8080';

// Default env values - these would normally come from import.meta.env 
// but we're hardcoding them for simplicity
const ENV = {
  LATTICE_DEVICE_ID: '2YzJTt', // From example/.env
  LATTICE_PASSWORD: 'your_lattice_password', // From example/.env
  LATTICE_APP_SECRET: '',
  LATTICE_BASE_URL: API_BASE,
};

type ConnectPayload = {
  deviceId: string;
  password: string;
  name?: string;
  appSecret?: string;
};

type PairPayload = {
  deviceId: string;
  pairingCode: string;
};

type MethodPayload = {
  method: string;
  params: any[];
};

type SignPayload = {
  payload: string;
};

function App() {
  // State for forms
  const [connectForm, setConnectForm] = useState<ConnectPayload>({
    deviceId: ENV.LATTICE_DEVICE_ID,
    password: ENV.LATTICE_PASSWORD,
    name: 'Lattice Connect Test',
    appSecret: ENV.LATTICE_APP_SECRET,
  });
  
  const [token, setToken] = useState('');
  const [pairForm, setPairForm] = useState<PairPayload>({
    deviceId: ENV.LATTICE_DEVICE_ID,
    pairingCode: '',
  });
  
  const [methodForm, setMethodForm] = useState({
    deviceId: ENV.LATTICE_DEVICE_ID,
    method: 'eth_accounts',
    params: '[]',
  });
  
  const [signForm, setSignForm] = useState({
    deviceId: ENV.LATTICE_DEVICE_ID,
    payload: '0x68656c6c6f20776f726c64', // "hello world" in hex
  });
  
  // Response handling
  const [connectResponse, setConnectResponse] = useState('');
  const [pairResponse, setPairResponse] = useState('');
  const [methodResponse, setMethodResponse] = useState('');
  const [signResponse, setSignResponse] = useState('');
  const [provisionResponse, setProvisionResponse] = useState('');
  const [error, setError] = useState('');
  
  // Update deviceId across all forms when the token is received
  useEffect(() => {
    if (token && connectForm.deviceId) {
      setPairForm(prev => ({ ...prev, deviceId: connectForm.deviceId }));
      setMethodForm(prev => ({ ...prev, deviceId: connectForm.deviceId }));
      setSignForm(prev => ({ ...prev, deviceId: connectForm.deviceId }));
    }
  }, [token, connectForm.deviceId]);

  // Update UI token when apiClient token changes
  useEffect(() => {
    const checkToken = () => {
      const currentToken = apiClient.getToken();
      if (currentToken !== token) {
        setToken(currentToken || '');
      }
    };

    // Initial check
    checkToken();

    // Set up interval to check for token changes
    const intervalId = setInterval(checkToken, 1000);
    return () => clearInterval(intervalId);
  }, [token]);

  // Handle connect form submission
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setConnectResponse('');
    
    try {
      const payload = { ...connectForm };
      // Remove empty values
      if (!payload.appSecret) delete payload.appSecret;
      if (!payload.name) delete payload.name;
      
      const response = await apiClient.connectDevice(payload);
      setConnectResponse(JSON.stringify(response, null, 2));
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Handle pair form submission
  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPairResponse('');
    
    try {
      const response = await apiClient.pairDevice(pairForm);
      setPairResponse(JSON.stringify(response, null, 2));
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Handle method form submission
  const handleMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMethodResponse('');
    
    try {
      const payload: MethodPayload = {
        method: methodForm.method,
        params: JSON.parse(methodForm.params),
      };
      
      const response = await apiClient.callDeviceMethod(methodForm.deviceId, payload);
      setMethodResponse(JSON.stringify(response, null, 2));
    } catch (e: any) {
      setError(`Error: ${e.message}`);
    }
  };

  // Handle sign form submission
  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSignResponse('');
    
    try {
      const payload: SignPayload = {
        payload: signForm.payload,
      };
      
      const response = await apiClient.signRequest(signForm.deviceId, payload);
      setSignResponse(JSON.stringify(response, null, 2));
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Handle provision
  const handleProvision = async () => {
    setError('');
    setProvisionResponse('');
    
    try {
      const response = await apiClient.provisionUser({});
      setProvisionResponse(JSON.stringify(response, null, 2));
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="App">
      <h1>Lattice Connect Local Test UI</h1>
      
      {token && (
        <div className="token-display">
          <h3>Current Token</h3>
          <p className="token">{token}</p>
        </div>
      )}
      
      <div className="form-container">
        {/* Connect to Device */}
        <section className="form-section">
          <h2>1. Connect to Device</h2>
          <form onSubmit={handleConnect}>
            <div className="form-group">
              <label htmlFor="connect-device-id">Device ID:</label>
              <input
                id="connect-device-id"
                value={connectForm.deviceId}
                onChange={(e) => setConnectForm(prev => ({ ...prev, deviceId: e.target.value }))}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="connect-password">Password:</label>
              <input
                id="connect-password"
                type="password"
                value={connectForm.password}
                onChange={(e) => setConnectForm(prev => ({ ...prev, password: e.target.value }))}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="connect-name">App Name (optional):</label>
              <input
                id="connect-name"
                value={connectForm.name || ''}
                onChange={(e) => setConnectForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="connect-app-secret">App Secret (optional):</label>
              <input
                id="connect-app-secret"
                value={connectForm.appSecret || ''}
                onChange={(e) => setConnectForm(prev => ({ ...prev, appSecret: e.target.value }))}
              />
            </div>
            
            <button type="submit">Connect</button>
          </form>
          
          {connectResponse && (
            <div className="response">
              <h4>Response:</h4>
              <pre>{connectResponse}</pre>
            </div>
          )}
        </section>
        
        {/* Pair with Device */}
        <section className="form-section">
          <h2>2. Pair with Device</h2>
          <form onSubmit={handlePair}>
            <div className="form-group">
              <label htmlFor="pair-device-id">Device ID:</label>
              <input
                id="pair-device-id"
                value={pairForm.deviceId}
                onChange={(e) => setPairForm(prev => ({ ...prev, deviceId: e.target.value }))}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="pair-code">Pairing Code:</label>
              <input
                id="pair-code"
                value={pairForm.pairingCode}
                onChange={(e) => setPairForm(prev => ({ ...prev, pairingCode: e.target.value }))}
                required
                placeholder="Enter pairing code shown on Lattice"
              />
            </div>
            
            <button type="submit" disabled={!token}>Pair</button>
            {!token && <p className="help-text">Connect first to get a token</p>}
          </form>
          
          {pairResponse && (
            <div className="response">
              <h4>Response:</h4>
              <pre>{pairResponse}</pre>
            </div>
          )}
        </section>
        
        {/* Call Device Method */}
        <section className="form-section">
          <h2>3. Call Device Method</h2>
          <form onSubmit={handleMethod}>
            <div className="form-group">
              <label htmlFor="method-device-id">Device ID:</label>
              <input
                id="method-device-id"
                value={methodForm.deviceId}
                onChange={(e) => setMethodForm(prev => ({ ...prev, deviceId: e.target.value }))}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="method-name">Method:</label>
              <select
                id="method-name"
                value={methodForm.method}
                onChange={(e) => setMethodForm(prev => ({ ...prev, method: e.target.value }))}
              >
                <option value="eth_accounts">eth_accounts</option>
                <option value="eth_requestAccounts">eth_requestAccounts</option>
                <option value="eth_chainId">eth_chainId</option>
                <option value="eth_signTransaction">eth_signTransaction</option>
                <option value="personal_sign">personal_sign</option>
                <option value="eth_sign">eth_sign</option>
                <option value="eth_signTypedData_v4">eth_signTypedData_v4</option>
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="method-params">Params (JSON array):</label>
              <textarea
                id="method-params"
                value={methodForm.params}
                onChange={(e) => setMethodForm(prev => ({ ...prev, params: e.target.value }))}
                placeholder="[]"
              />
            </div>
            
            <button type="submit" disabled={!token}>Call Method</button>
            {!token && <p className="help-text">Connect first to get a token</p>}
          </form>
          
          {methodResponse && (
            <div className="response">
              <h4>Response:</h4>
              <pre>{methodResponse}</pre>
            </div>
          )}
        </section>
        
        {/* Sign Request */}
        <section className="form-section">
          <h2>4. Sign Request</h2>
          <form onSubmit={handleSign}>
            <div className="form-group">
              <label htmlFor="sign-device-id">Device ID:</label>
              <input
                id="sign-device-id"
                value={signForm.deviceId}
                onChange={(e) => setSignForm(prev => ({ ...prev, deviceId: e.target.value }))}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="sign-payload">Payload (hex):</label>
              <input
                id="sign-payload"
                value={signForm.payload}
                onChange={(e) => setSignForm(prev => ({ ...prev, payload: e.target.value }))}
                required
              />
            </div>
            
            <button type="submit" disabled={!token}>Sign</button>
            {!token && <p className="help-text">Connect first to get a token</p>}
          </form>
          
          {signResponse && (
            <div className="response">
              <h4>Response:</h4>
              <pre>{signResponse}</pre>
            </div>
          )}
        </section>
        
        {/* Provision New User (optional) */}
        <section className="form-section">
          <h2>5. Provision New User</h2>
          <button onClick={handleProvision}>Provision</button>
          
          {provisionResponse && (
            <div className="response">
              <h4>Response:</h4>
              <pre>{provisionResponse}</pre>
            </div>
          )}
        </section>
      </div>
      
      {/* Error display */}
      {error && (
        <div className="error-container">
          <h3>Error</h3>
          <pre>{error}</pre>
        </div>
      )}
    </div>
  );
}

export default App; 
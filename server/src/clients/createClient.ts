import rp from 'superagent';
export interface IAdminConfig {
  url: URL,
  username: string,
  password: string
}

type APIArgs = {
  api: string;
  payload?: any;
};

type APIMethod = (
  {
    api,
    payload
  }: APIArgs) => rp.SuperAgentRequest;

export interface IAdminClient {
  get: APIMethod,
  put: APIMethod
}

function _createClient({ url, username, password }: IAdminConfig): {
  client: IAdminClient
} {
  //--------------------------------------------------
  // GET
  //--------------------------------------------------
  function get({
    api, payload
  }: {
    api: string;
    payload?: any;
  }) {
    console.log(`${url}api/${api}`)
    return rp
      .get(`${url}api/${api}`)
      .auth(username, password)
      .set('Content-Type', 'application/json')
      .send(payload)
  }

  //--------------------------------------------------
  // PUT
  //--------------------------------------------------
  function put({
    api, payload
  }: {
    api: string;
    payload?: any;
  }) {
    return rp
      .put(`${url}api/${api}`)
      .auth(username, password)
      .set('Content-Type', 'application/json')
      .send(payload);
  }

  return { client: { get, put } }
}

export function createClient({ url, username, password }: {
  url: URL | undefined,  
  username: string | undefined,
  password: string |  undefined
}): Promise<{ client: IAdminClient }> {
  return new Promise((res, rej) => {
    if (!url) {
      rej(new Error(`Invalid Admin Config: HOST || ADDRESS  (undefined)`))
    }
    if (!username) {
      rej(new Error(`Invalid Admin Config: USERNAME (undefined)`))
    }
    if (!password) {
      rej(new Error(`Invalid Admin Config: PASSWORD (undefined)`))
    }

    res(_createClient({
      url: url!,
      username: username!,
      password: password!
    }))
  })
}
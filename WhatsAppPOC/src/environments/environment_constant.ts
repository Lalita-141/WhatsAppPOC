const httpCode = 'http';

// "prod" must be an https:// address before a store release: tokens and
// messages travel over this connection. See docs/DEPLOYMENT.md.
export const environments = {
  dev: `${httpCode}://172.20.1.86:5001/api/v1/`,
  local: `${httpCode}://localhost:5001/api/v1/`,
  prod: `${httpCode}://172.20.1.72:5001/api/v1/`,
};

// Each address must start with http:// or https://; without the slashes the
// chat connection (Socket.IO) cannot connect even though API calls still work.
// Debug builds talk to "dev"; release builds to "prod".
export const activeBaseUrl = __DEV__ ? environments.dev : environments.prod;

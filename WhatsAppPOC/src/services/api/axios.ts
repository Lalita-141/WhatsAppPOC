import { environments } from '../../environments/environment_constant';

export const apiClient = {
  baseUrl: environments.dev,
  get: async (url: string, headers: Record<string, string> = {}) => {
    return fetch(url, { method: 'GET', headers });
  },
  post: async (url: string, data?: any, headers: Record<string, string> = {}) => {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: data ? JSON.stringify(data) : undefined,
    });
  },
};

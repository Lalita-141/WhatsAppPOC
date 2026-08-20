import { Platform } from 'react-native';

const API_PORT = 5001;

export const API_BASE_URL =
  Platform.OS === 'android'
    ? `http://172.20.1.60:${API_PORT}`
    : `http://172.20.1.60:${API_PORT}`;

export const getDefaultApiBaseUrl = (customIp?: string | null): string => {
  if (customIp && customIp.trim().length > 0) {
    return `http://${customIp.trim()}:${API_PORT}/api/v1`;
  }
  return Platform.OS === 'android'
    ? `http://172.20.1.60${API_PORT}/api/v1`
    : `http://172.20.1.60:${API_PORT}/api/v1`;
};

import { Platform } from 'react-native';
import { environments } from '../../environments/environment_constant';
import { apiPath } from '../../environments/environment_urls';

export const API_PORT = 5001;
export const DEFAULT_HOST = '172.20.1.72';

// Global Base URL from environments
export const API_BASE_URL = environments.dev.replace(/\/$/, '');

export const getDefaultApiBaseUrl = (customIp?: string | null): string => {
  if (customIp && customIp.trim().length > 0) {
    return `http://${customIp.trim()}:${API_PORT}/api/v1`;
  }
  return API_BASE_URL;
};

// Re-export environments and apiPath for convenience
export { environments, apiPath };

// Centralized API Endpoints mapping to apiPath
export const API_ENDPOINTS = {
  COUNTRIES: apiPath.countries,
  AUTH: {
    SEND_OTP: apiPath.sendOtp,
    VERIFY_OTP: apiPath.verifyOtp,
    ME: apiPath.me,
  },
  USER: {
    PROFILE: apiPath.userProfile,
  },
  ORGANIZATION: {
    SETUP: apiPath.orgSetup,
  },
  CONTACTS: {
    CHECK_SYNC: apiPath.syncContacts,
  },
  CHAT: {
    CONVERSATIONS: apiPath.conversations,
    SEND_PERSONAL: apiPath.sendPersonalMessage,
    PERSONAL_HISTORY: (userOrganizationId: string) =>
      apiPath.personalHistory.replace('{userOrganizationId}', String(userOrganizationId).trim()),
  },
};

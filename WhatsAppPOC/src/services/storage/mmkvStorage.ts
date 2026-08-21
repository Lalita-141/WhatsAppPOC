import { MMKV } from 'react-native-mmkv';

// Central MMKV instance
export const storage = new MMKV({
  id: 'whatsapp-poc-storage',
});

// Storage Keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'user_access_token',
  REFRESH_TOKEN: 'user_refresh_token',
  USER_DATA: 'user_profile_data',
  ORG_CODE: 'user_org_code',
  MOBILE_NO: 'user_mobile_no',
  COUNTRY_ID: 'user_country_id',
  THEME_MODE: 'app_theme_mode',
  CUSTOM_IP: 'custom_api_ip',
};

/**
 * Storage Service Wrapper with typed helper methods
 */
export const storageService = {
  // Token management
  setToken: (token: string) => {
    storage.set(STORAGE_KEYS.ACCESS_TOKEN, token);
  },

  getToken: (): string | null => {
    return storage.getString(STORAGE_KEYS.ACCESS_TOKEN) || null;
  },

  removeToken: () => {
    storage.delete(STORAGE_KEYS.ACCESS_TOKEN);
  },

  // User Profile data management
  setUser: (user: any) => {
    storage.set(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  },

  getUser: <T>(): T | null => {
    const raw = storage.getString(STORAGE_KEYS.USER_DATA);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  removeUser: () => {
    storage.delete(STORAGE_KEYS.USER_DATA);
  },

  // Generic String
  setString: (key: string, value: string) => {
    storage.set(key, value);
  },

  getString: (key: string): string | null => {
    return storage.getString(key) || null;
  },

  // Generic Object (JSON)
  setObject: (key: string, value: any) => {
    storage.set(key, JSON.stringify(value));
  },

  getObject: <T>(key: string): T | null => {
    const raw = storage.getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  // Generic Boolean
  setBoolean: (key: string, value: boolean) => {
    storage.set(key, value);
  },

  getBoolean: (key: string): boolean => {
    return storage.getBoolean(key) || false;
  },

  // Generic Number
  setNumber: (key: string, value: number) => {
    storage.set(key, value);
  },

  getNumber: (key: string): number | undefined => {
    return storage.getNumber(key);
  },

  // Remove Key
  removeItem: (key: string) => {
    storage.delete(key);
  },

  // Clear all stored data
  clearAll: () => {
    storage.clearAll();
  },
};

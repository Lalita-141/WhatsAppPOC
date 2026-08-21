import { MMKV } from 'react-native-mmkv';
import { StateStorage } from 'zustand/middleware';

// Initialize a new MMKV instance
export const storage = new MMKV();

// Create an adapter for Zustand to use MMKV
export const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    return storage.set(name, value);
  },
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    return storage.delete(name);
  },
};

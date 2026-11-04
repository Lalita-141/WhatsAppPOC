import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './AppNavigator';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export const resetToLogin = () => {
  if (navigationRef.isReady()) {
    navigationRef.reset({ index: 0, routes: [{ name: 'login' }] });
  }
};

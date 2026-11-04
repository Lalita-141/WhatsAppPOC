import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/services/api/queryClient';
import { ThemeProvider, useTheme } from './src/core/theme';
import { AppNavigator } from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { socket } from './src/services/socket';
import { getFCMToken, requestNotificationPermission } from './src/services/notifications/fcmService';
import { CallOverlay } from './src/features/calls/screens/CallOverlay';
import { AppLockGate } from './src/features/security/appLock';

function MainApp() {
  useEffect(() => {
    const setupFCM = async () => {
      await requestNotificationPermission();
      await getFCMToken();
    };

    setupFCM();
  }, []);
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();


  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      {/* Navigation Stack */}
      <AppNavigator />

      {/* Calls appear above every screen */}
      <CallOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeProvider>
          <NavigationContainer ref={navigationRef}>
            <AppLockGate>
              <MainApp />
            </AppLockGate>
          </NavigationContainer>
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import Screens from Auth Feature
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { OtpScreen } from '../features/auth/screens/OtpScreen';
import { ProfileSetupScreen } from '../features/auth/screens/ProfileSetupScreen';
import { OrganizationSetupScreen } from '../features/auth/screens/OrganizationSetupScreen';
import { PendingApprovalScreen } from '../features/auth/screens/PendingApprovalScreen';

// Import Screens from Dashboard Feature
import { HomeScreen } from '../features/dashboard/screens/HomeScreen';
import { restoreSession, useAuthStore } from '../features/auth/store/authStore';
export type RootStackParamList = {
  login: undefined;
  otp: undefined;
  profile_setup: undefined;
  organization_setup: undefined;
  home: undefined;
  pending_approval: { organizationName?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  // Tokens come from the Keychain/Keystore asynchronously, so the first screen
  // is chosen once they are loaded. A signed-in user goes straight to home.
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    let active = true;

    restoreSession()
      .catch(() => undefined)
      .finally(() => {
        if (!active) {
          return;
        }
        const { refreshToken, nextStep } = useAuthStore.getState();
        setInitialRoute(refreshToken && nextStep === 'LOGIN' ? 'home' : 'login');
      });

    return () => {
      active = false;
    };
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="login" component={LoginScreen} />
      <Stack.Screen name="otp" component={OtpScreen} />
      <Stack.Screen name="profile_setup" component={ProfileSetupScreen} />
      <Stack.Screen name="organization_setup" component={OrganizationSetupScreen} />
      <Stack.Screen name="home" component={HomeScreen} />
      <Stack.Screen name="pending_approval" component={PendingApprovalScreen} />
    </Stack.Navigator>
  );
}

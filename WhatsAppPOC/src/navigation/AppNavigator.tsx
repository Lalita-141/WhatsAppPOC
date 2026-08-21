import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import Screens from Auth Feature
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { OtpScreen } from '../features/auth/screens/OtpScreen';
import { ProfileSetupScreen } from '../features/auth/screens/ProfileSetupScreen';
import { OrganizationSetupScreen } from '../features/auth/screens/OrganizationSetupScreen';

// Import Screens from Dashboard Feature
import { HomeScreen } from '../features/dashboard/screens/HomeScreen';

export type RootStackParamList = {
  login: undefined;
  otp: undefined;
  profile_setup: undefined;
  organization_setup: undefined;
  home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="login"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="login" component={LoginScreen} />
      <Stack.Screen name="otp" component={OtpScreen} />
      <Stack.Screen name="profile_setup" component={ProfileSetupScreen} />
      <Stack.Screen name="organization_setup" component={OrganizationSetupScreen} />
      <Stack.Screen name="home" component={HomeScreen} />
    </Stack.Navigator>
  );
}

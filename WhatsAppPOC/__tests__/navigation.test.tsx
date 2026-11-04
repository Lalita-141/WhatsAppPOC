/**
 * @format
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../src/navigation/AppNavigator';
import { OtpScreen } from '../src/features/auth/screens/OtpScreen';
import { useAuthStore } from '../src/features/auth/store/authStore';
import { ThemeProvider } from '../src/core/theme';

jest.mock('../src/features/auth/screens/LoginScreen', () => ({
  LoginScreen: () => {
    const { Text: MockText } = require('react-native');
    return <MockText>login-screen</MockText>;
  },
}));

jest.mock('../src/features/dashboard/screens/HomeScreen', () => ({
  HomeScreen: () => {
    const { Text: MockText } = require('react-native');
    return <MockText>home-screen</MockText>;
  },
}));

const renderNavigator = async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return renderer;
};

const textsIn = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).flatMap((node) => node.props.children);

describe('session restore', () => {
  it('opens home for a signed-in user', async () => {
    useAuthStore.setState({ refreshToken: 'refresh', accessToken: 'a', nextStep: 'LOGIN' });
    expect(textsIn(await renderNavigator())).toContain('home-screen');
  });

  it('opens login without a session', async () => {
    useAuthStore.setState({ refreshToken: '', accessToken: '', nextStep: 'LOGIN' });
    expect(textsIn(await renderNavigator())).toContain('login-screen');
  });

  it('opens login for an old session that has no refresh token', async () => {
    useAuthStore.setState({ refreshToken: '', accessToken: 'old', nextStep: 'LOGIN' });
    expect(textsIn(await renderNavigator())).toContain('login-screen');
  });

  it('opens login when setup was left unfinished', async () => {
    useAuthStore.setState({ refreshToken: '', accessToken: 'setup', nextStep: 'PROFILE_SETUP' });
    expect(textsIn(await renderNavigator())).toContain('login-screen');
  });
});

describe('OTP screen', () => {
  it('accepts 6 digits', async () => {
    useAuthStore.setState({ otp: '', serverOtpHint: null });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 390, height: 844 },
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
          }}
        >
          <ThemeProvider>
            <NavigationContainer>
              <OtpScreen />
            </NavigationContainer>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    const input = renderer.root.findAll(
      (node) => node.props.maxLength !== undefined,
    )[0];
    expect(input.props.maxLength).toBe(6);
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });
});

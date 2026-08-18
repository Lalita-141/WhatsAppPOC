import React from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/core/theme';
import { useAuthFlow } from './src/features/auth/hooks/useAuthFlow';

// Import Screens from Auth Feature
import { LoginScreen } from './src/features/auth/screens/LoginScreen';
import { OtpScreen } from './src/features/auth/screens/OtpScreen';
import { ProfileSetupScreen } from './src/features/auth/screens/ProfileSetupScreen';
import { OrganizationSetupScreen } from './src/features/auth/screens/OrganizationSetupScreen';

// Import Screens from Dashboard Feature
import { HomeScreen } from './src/features/dashboard/screens/HomeScreen';

function MainApp() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const {
    currentScreen,
    orgCode,
    setOrgCode,
    mobileNo,
    setMobileNo,
    selectedCountry,
    setSelectedCountry,
    otp,
    setOtp,
    accessToken,
    nextStep,
    isLoading,
    errorMessage,
    serverOtpHint,
    customIp,
    setCustomIp,
    apiBaseUrl,
    handleSendOtp,
    handleVerifyOtp,
    handleResendOtp,
    handleBackToLogin,
    handleLogout,
    handleProfileSetupSave,
    handleOrganizationSetupSave,
    setNextStep,
    setCurrentScreen,
  } = useAuthFlow();

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

      {/* Screen Dispatcher */}
      {currentScreen === 'login' && (
        <LoginScreen
          apiBaseUrl={apiBaseUrl}
          orgCode={orgCode}
          setOrgCode={setOrgCode}
          mobileNo={mobileNo}
          setMobileNo={setMobileNo}
          selectedCountry={selectedCountry}
          setSelectedCountry={setSelectedCountry}
          customIp={customIp}
          setCustomIp={setCustomIp}
          onSendOtp={handleSendOtp}
          isLoading={isLoading}
          errorMessage={errorMessage}
        />
      )}

      {currentScreen === 'otp' && (
        <OtpScreen
          mobileNo={mobileNo}
          countryCode={selectedCountry ? selectedCountry.countryCode : ''}
          otp={otp}
          setOtp={setOtp}
          onVerifyOtp={handleVerifyOtp}
          onResendOtp={handleResendOtp}
          onBack={handleBackToLogin}
          isLoading={isLoading}
          errorMessage={errorMessage}
          serverOtpHint={serverOtpHint}
        />
      )}

      {currentScreen === 'profile_setup' && (
        <ProfileSetupScreen
          token={accessToken}
          orgCode={orgCode}
          countryCode={selectedCountry ? selectedCountry.countryCode : ''}
          countryId={selectedCountry ? selectedCountry.countryId : ''}
          mobileNo={mobileNo}
          onSaveProfile={handleProfileSetupSave}
          onCancel={handleBackToLogin}
          isLoading={isLoading}
          errorMessage={errorMessage}
        />
      )}

      {currentScreen === 'organization_setup' && (
        <OrganizationSetupScreen
          token={accessToken}
          mobileNo={mobileNo}
          onSaveOrg={handleOrganizationSetupSave}
          onCancel={handleBackToLogin}
          isLoading={isLoading}
          errorMessage={errorMessage}
        />
      )}

      {currentScreen === 'home' && (
        <HomeScreen
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          nextStep={nextStep}
          onLogout={handleLogout}
          onTestProfileSetup={() => {
            if (!selectedCountry) {
              setSelectedCountry({ countryId: '1', countryName: 'India', countryCode: '+91', isoCode: 'IN', iso3Code: 'IND', flag: '🇮🇳' });
            }
            setNextStep('PROFILE_SETUP');
            setCurrentScreen('profile_setup');
          }}
        />
      )}
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
    <SafeAreaProvider>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

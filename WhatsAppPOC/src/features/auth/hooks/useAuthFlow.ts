import { useState } from 'react';
import { getDefaultApiBaseUrl } from '../../../core/config/ApiConfig';
import {
  Country,
  sendOtp,
  verifyOtp,
  setupProfile,
  setupOrganization,
} from '../services/authApi';

type ScreenType = 'login' | 'otp' | 'profile_setup' | 'organization_setup' | 'home';
//. custom hooks useAuthFlow use to manage the authentication flow. this code is also used to move 
// between the screens. and also manage the state of the application.
export const useAuthFlow = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('login');

  // Input Settings
  const [orgCode, setOrgCode] = useState('HNT001');
  const [mobileNo, setMobileNo] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [otp, setOtp] = useState('');

  // Authentication State
  const [accessToken, setAccessToken] = useState('');
  const [nextStep, setNextStep] = useState<'PROFILE_SETUP' | 'ORGANIZATION_SETUP' | 'LOGIN'>('LOGIN');

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverOtpHint, setServerOtpHint] = useState<string | null>(null);

  // Developer/Testing custom base IP
  const [customIp, setCustomIp] = useState('172.20.1.72');

  // Compute Base URL dynamically
  const apiBaseUrl = getDefaultApiBaseUrl(customIp);

  // Action: Request OTP
  const handleSendOtp = async () => {
    if (!selectedCountry) {
      setErrorMessage('Please select a country');
      return;
    }
    if (!mobileNo.trim()) {
      setErrorMessage('Please enter a mobile number');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setServerOtpHint(null);

    try {
      const response = await sendOtp(
        apiBaseUrl,
        orgCode,
        selectedCountry.countryId,
        mobileNo
      );

      if (response && response.data && response.data.otp) {
        setServerOtpHint(response.data.otp);
      }

      setCurrentScreen('otp');
    } catch (err: any) {
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Action: Verify OTP code
  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      setErrorMessage('Please enter the 4-digit code');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await verifyOtp(
        apiBaseUrl,
        orgCode,
        selectedCountry!.countryId,
        mobileNo,
        otp
      );

      setAccessToken(data.token);
      setNextStep(data.nextStep);

      if (data.nextStep === 'PROFILE_SETUP') {
        setCurrentScreen('profile_setup');
      } else if (data.nextStep === 'ORGANIZATION_SETUP') {
        setCurrentScreen('organization_setup');
      } else {
        setOtp('');
        setCurrentScreen('home');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Action: Resend OTP
  const handleResendOtp = async () => {
    setOtp('');
    await handleSendOtp();
  };

  // Action: Go Back (to Login Screen)
  const handleBackToLogin = () => {
    setOtp('');
    setErrorMessage(null);
    setCurrentScreen('login');
  };

  // Action: Log Out
  const handleLogout = () => {
    setAccessToken('');
    setOtp('');
    setErrorMessage(null);
    setServerOtpHint(null);
    setCurrentScreen('login');
  };

  // Action: Save Profile & auto-verify to complete login
  const handleProfileSetupSave = async (firstName: string, lastName: string, about: string) => {
    if (!selectedCountry) {
      setErrorMessage('Country details missing');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await setupProfile(apiBaseUrl, accessToken, {
        orgCode,
        countryId: selectedCountry.countryId,
        mobileNo,
        firstName,
        lastName,
        about,
      });

      // User profile created successfully.
      if (otp && otp.length === 4) {
        try {
          const data = await verifyOtp(
            apiBaseUrl,
            orgCode,
            selectedCountry.countryId,
            mobileNo,
            otp
          );
          setAccessToken(data.token);
          setNextStep(data.nextStep);
          setOtp('');
          setCurrentScreen('home');
          return;
        } catch (verifyErr) {
          console.warn('Programmatic OTP auto-login failed, falling back to manual OTP request:', verifyErr);
        }
      }

      // Fallback
      const response = await sendOtp(apiBaseUrl, orgCode, selectedCountry.countryId, mobileNo);
      if (response && response.data && response.data.otp) {
        setServerOtpHint(response.data.otp);
      }
      setOtp('');
      setCurrentScreen('otp');
    } catch (err: any) {
      setErrorMessage(err.message || 'Profile setup failed. Please check details.');
    } finally {
      setIsLoading(false);
    }
  };

  // Action: Save User-Organization relationship
  const handleOrganizationSetupSave = async (organizationCode: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await setupOrganization(apiBaseUrl, accessToken, {
        orgCode: organizationCode,
      });

      // Link completed successfully.
      if (otp && otp.length === 4) {
        try {
          const data = await verifyOtp(
            apiBaseUrl,
            orgCode,
            selectedCountry!.countryId,
            mobileNo,
            otp
          );
          setAccessToken(data.token);
          setNextStep(data.nextStep);
          setOtp('');
          setCurrentScreen('home');
          return;
        } catch (verifyErr) {
          console.warn('Programmatic OTP auto-login failed, falling back to manual OTP request:', verifyErr);
        }
      }

      // Fallback
      const response = await sendOtp(apiBaseUrl, orgCode, selectedCountry!.countryId, mobileNo);
      if (response && response.data && response.data.otp) {
        setServerOtpHint(response.data.otp);
      }
      setOtp('');
      setCurrentScreen('otp');
    } catch (err: any) {
      setErrorMessage(err.message || 'Organization connection failed. Check code.');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    currentScreen,
    setCurrentScreen,
    orgCode,
    setOrgCode,
    mobileNo,
    setMobileNo,
    selectedCountry,
    setSelectedCountry,
    otp,
    setOtp,
    accessToken,
    setAccessToken,
    nextStep,
    setNextStep,
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
  };
};

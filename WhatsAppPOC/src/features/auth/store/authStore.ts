import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '../../../core/store/storage';
import { getDefaultApiBaseUrl } from '../../../core/config/ApiConfig';
import {
  Country,
  sendOtp,
  verifyOtp,
  setupProfile,
  setupOrganization,
} from '../api/authApi';

interface AuthState {
  // Input Settings
  orgCode: string;
  mobileNo: string;
  selectedCountry: Country | null;
  otp: string;

  // Authentication State
  accessToken: string;
  nextStep: 'PROFILE_SETUP' | 'ORGANIZATION_SETUP' | 'LOGIN' | 'HOME';

  // UI States
  isLoading: boolean;
  errorMessage: string | null;
  serverOtpHint: string | null;

  // Developer/Testing custom base IP
  customIp: string;
  apiBaseUrl: string;

  // Setters
  setOrgCode: (code: string) => void;
  setMobileNo: (no: string) => void;
  setSelectedCountry: (country: Country | null) => void;
  setOtp: (otp: string) => void;
  setAccessToken: (token: string) => void;
  setNextStep: (step: 'PROFILE_SETUP' | 'ORGANIZATION_SETUP' | 'LOGIN' | 'HOME') => void;
  setCustomIp: (ip: string) => void;
  setErrorMessage: (msg: string | null) => void;

  // Actions
  handleSendOtp: (navigation: any) => Promise<void>;
  handleVerifyOtp: (navigation: any) => Promise<void>;
  handleResendOtp: (navigation: any) => Promise<void>;
  handleBackToLogin: (navigation: any) => void;
  handleLogout: (navigation: any) => void;
  handleProfileSetupSave: (firstName: string, lastName: string, about: string, navigation: any) => Promise<void>;
  handleOrganizationSetupSave: (organizationCode: string, navigation: any) => Promise<void>;
  testProfileSetupNavigate: (navigation: any) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      orgCode: 'HNT001',
      mobileNo: '',
      selectedCountry: null,
      otp: '',
      accessToken: '',
      nextStep: 'LOGIN',
      isLoading: false,
      errorMessage: null,
      serverOtpHint: null,
      customIp: '172.20.1.72',
      apiBaseUrl: getDefaultApiBaseUrl('172.20.1.72'),

      setOrgCode: (code) => set({ orgCode: code }),
      setMobileNo: (no) => set({ mobileNo: no }),
      setSelectedCountry: (country) => set({ selectedCountry: country }),
      setOtp: (otp) => set({ otp }),
      setAccessToken: (token) => set({ accessToken: token }),
      setNextStep: (step) => set({ nextStep: step }),
      setCustomIp: (ip) => set({ customIp: ip, apiBaseUrl: getDefaultApiBaseUrl(ip) }),
      setErrorMessage: (msg) => set({ errorMessage: msg }),

      handleSendOtp: async (navigation) => {
        const state = get();
        if (!state.selectedCountry) {
          set({ errorMessage: 'Please select a country' });
          return;
        }
        if (!state.mobileNo.trim()) {
          set({ errorMessage: 'Please enter a mobile number' });
          return;
        }

        set({ isLoading: true, errorMessage: null, serverOtpHint: null });

        try {
          const apiBaseUrl = getDefaultApiBaseUrl(state.customIp);
          const response = await sendOtp(
            apiBaseUrl,
            state.orgCode,
            state.selectedCountry.countryId,
            state.mobileNo
          );

          const rawOtp =
            (response && response.data && (response.data as any).otp) ||
            (response as any)?.otp;
          if (rawOtp) {
            set({ serverOtpHint: String(rawOtp) });
          }

          navigation.navigate('otp');
        } catch (err: any) {
          set({ errorMessage: err.message || 'Something went wrong. Please try again.' });
        } finally {
          set({ isLoading: false });
        }
      },

      handleVerifyOtp: async (navigation) => {
        const state = get();
        if (state.otp.length < 4) {
          set({ errorMessage: 'Please enter the 4-digit code' });
          return;
        }

        set({ isLoading: true, errorMessage: null });

        try {
          const apiBaseUrl = getDefaultApiBaseUrl(state.customIp);
          const data = await verifyOtp(
            apiBaseUrl,
            state.orgCode,
            state.selectedCountry!.countryId,
            state.mobileNo,
            state.otp
          );

          set({ accessToken: data.token, nextStep: data.nextStep });

          if (data.nextStep === 'PROFILE_SETUP') {
            navigation.navigate('profile_setup');
          } else if (data.nextStep === 'ORGANIZATION_SETUP') {
            navigation.navigate('organization_setup');
          } else {
            set({ otp: '' });
            navigation.reset({ index: 0, routes: [{ name: 'home' }] });
          }
        } catch (err: any) {
          set({ errorMessage: err.message || 'Verification failed. Try again.' });
        } finally {
          set({ isLoading: false });
        }
      },

      handleResendOtp: async (navigation) => {
        set({ otp: '' });
        await get().handleSendOtp(navigation);
      },

      handleBackToLogin: (navigation) => {
        set({ otp: '', errorMessage: null });
        navigation.navigate('login');
      },

      handleLogout: (navigation) => {
        set({ accessToken: '', otp: '', errorMessage: null, serverOtpHint: null });
        navigation.reset({ index: 0, routes: [{ name: 'login' }] });
      },

      handleProfileSetupSave: async (firstName, lastName, about, navigation) => {
        const state = get();
        if (!state.selectedCountry) {
          set({ errorMessage: 'Country details missing' });
          return;
        }
        set({ isLoading: true, errorMessage: null });
        try {
          const apiBaseUrl = getDefaultApiBaseUrl(state.customIp);
          await setupProfile(apiBaseUrl, state.accessToken, {
            orgCode: state.orgCode,
            countryId: state.selectedCountry.countryId,
            mobileNo: state.mobileNo,
            firstName,
            lastName,
            about,
          });

          // User profile created successfully.
          if (state.otp && state.otp.length === 4) {
            try {
              const data = await verifyOtp(
                apiBaseUrl,
                state.orgCode,
                state.selectedCountry.countryId,
                state.mobileNo,
                state.otp
              );
              set({ accessToken: data.token, nextStep: data.nextStep, otp: '' });
              navigation.reset({ index: 0, routes: [{ name: 'home' }] });
              return;
            } catch (verifyErr) {
              console.warn('Programmatic OTP auto-login failed, falling back to manual OTP request:', verifyErr);
            }
          }

          // Fallback
          const response = await sendOtp(apiBaseUrl, state.orgCode, state.selectedCountry.countryId, state.mobileNo);
          if (response && response.data && response.data.otp) {
            set({ serverOtpHint: response.data.otp });
          }
          set({ otp: '' });
          navigation.navigate('otp');
        } catch (err: any) {
          set({ errorMessage: err.message || 'Profile setup failed. Please check details.' });
        } finally {
          set({ isLoading: false });
        }
      },

      handleOrganizationSetupSave: async (organizationCode, navigation) => {
        const state = get();
        set({ isLoading: true, errorMessage: null });
        try {
          const apiBaseUrl = getDefaultApiBaseUrl(state.customIp);
          await setupOrganization(apiBaseUrl, state.accessToken, {
            orgCode: organizationCode,
          });

          // Link completed successfully.
          if (state.otp && state.otp.length === 4) {
            try {
              const data = await verifyOtp(
                apiBaseUrl,
                state.orgCode,
                state.selectedCountry!.countryId,
                state.mobileNo,
                state.otp
              );
              set({ accessToken: data.token, nextStep: data.nextStep, otp: '' });
              navigation.reset({ index: 0, routes: [{ name: 'home' }] });
              return;
            } catch (verifyErr) {
              console.warn('Programmatic OTP auto-login failed, falling back to manual OTP request:', verifyErr);
            }
          }

          // Fallback
          const response = await sendOtp(apiBaseUrl, state.orgCode, state.selectedCountry!.countryId, state.mobileNo);
          if (response && response.data && response.data.otp) {
            set({ serverOtpHint: response.data.otp });
          }
          set({ otp: '' });
          navigation.navigate('otp');
        } catch (err: any) {
          set({ errorMessage: err.message || 'Organization connection failed. Check code.' });
        } finally {
          set({ isLoading: false });
        }
      },

      testProfileSetupNavigate: (navigation) => {
        navigation.navigate('profile_setup');
      },
    }),
    {
      name: 'auth-storage', // unique name
      storage: createJSONStorage(() => zustandStorage), // use MMKV
      // Don't persist sensitive stuff like otp, or transient UI states
      partialize: (state) => ({ 
        accessToken: state.accessToken,
        orgCode: state.orgCode,
        mobileNo: state.mobileNo,
        selectedCountry: state.selectedCountry,
        nextStep: state.nextStep,
        customIp: state.customIp,
        apiBaseUrl: state.apiBaseUrl,
      }),
    }
  )
);

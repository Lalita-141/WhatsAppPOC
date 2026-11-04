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
  logoutSession,
  OTP_LENGTH,
} from '../api/authApi';
import { connectSocket, disconnectSocket } from '../../../services/socket';
import { queryClient } from '../../../services/api/queryClient';
import { registerSessionHandlers } from '../../../services/auth/authSession';
import { resetToLogin } from '../../../navigation/navigationRef';
import { loadTokens, saveTokens } from '../../../services/auth/secureTokenStore';
interface AuthState {
  // Input Settings
  orgCode: string;
  mobileNo: string;
  selectedCountry: Country | null;
  otp: string;

  // Authentication State
  accessToken: string;
  refreshToken: string;
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
  clearSession: () => void;
  setNextStep: (step: 'PROFILE_SETUP' | 'ORGANIZATION_SETUP' | 'LOGIN' | 'HOME') => void;
  setCustomIp: (ip: string) => void;
  setErrorMessage: (msg: string | null) => void;

  // Actions
  handleSendOtp: (navigation: any) => Promise<void>;
  handleVerifyOtp: (navigation: any) => Promise<void>;
  handleResendOtp: (navigation: any) => Promise<void>;
  handleBackToLogin: (navigation: any) => void;
  handleLogout: (navigation: any) => void;
  applySwitchedSession: (tokens: { token: string; refreshToken: string }, navigation: any) => void;
  endSessionLocally: (navigation: any) => void;
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
      refreshToken: '',
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
      // Also drops cached chats, so the next person on this phone cannot see them.
      clearSession: () => {
        disconnectSocket();
        queryClient.clear();
        set({ accessToken: '', refreshToken: '', otp: '', errorMessage: null, serverOtpHint: null });
      },
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

          if (__DEV__ && response?.data?.otp) {
            set({ serverOtpHint: response.data.otp });
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
        if (state.otp.length < OTP_LENGTH) {
          set({ errorMessage: `Please enter the ${OTP_LENGTH}-digit code` });
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

          set({ accessToken: data.token, refreshToken: data.refreshToken || '', nextStep: data.nextStep });

          if (data.nextStep === 'PROFILE_SETUP') {
            navigation.navigate('profile_setup');
          } else if (data.nextStep === 'ORGANIZATION_SETUP') {
            navigation.navigate('organization_setup');
          } else {
            connectSocket(data.token);
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
        const { refreshToken, clearSession } = get();
        // The screen changes immediately, and logging out still works offline.
        // The server drops this device's session and push token when reachable.
        logoutSession(refreshToken).catch((err) => {
          console.warn('Could not end the session on the server:', err?.message);
        });
        clearSession();
        navigation.reset({ index: 0, routes: [{ name: 'login' }] });
      },

      // Starts over with the new organization's tokens. Cached chats belong to the
      // previous organization, so they are dropped.
      applySwitchedSession: ({ token, refreshToken }, navigation) => {
        disconnectSocket();
        queryClient.clear();
        set({ accessToken: token, refreshToken, nextStep: 'LOGIN' });
        connectSocket(token);
        navigation.reset({ index: 0, routes: [{ name: 'home' }] });
      },

      // For when the server has already ended the session (log out everywhere,
      // account deleted), so there is nothing left to revoke.
      endSessionLocally: (navigation) => {
        get().clearSession();
        navigation.reset({ index: 0, routes: [{ name: 'login' }] });
      },

      handleProfileSetupSave: async (firstName, lastName, about, navigation) => {
        const state = get();
        set({ isLoading: true, errorMessage: null });
        try {
          const apiBaseUrl = getDefaultApiBaseUrl(state.customIp);
          const { data } = await setupProfile(apiBaseUrl, state.accessToken, {
            firstName,
            lastName,
            about,
          });

          if (data.status === 'PENDING_APPROVAL') {
            set({ accessToken: '', refreshToken: '', nextStep: 'LOGIN', otp: '' });
            navigation.reset({ index: 0, routes: [{ name: 'pending_approval', params: { organizationName: data.organizationName } }] });
            return;
          }

          set({ accessToken: data.token, refreshToken: data.refreshToken, nextStep: 'LOGIN', otp: '' });
          connectSocket(data.token);
          navigation.reset({ index: 0, routes: [{ name: 'home' }] });
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
          const { data } = await setupOrganization(apiBaseUrl, state.accessToken, {
            orgCode: organizationCode,
          });

          if (data.status === 'PENDING_APPROVAL') {
            set({ accessToken: '', refreshToken: '', nextStep: 'LOGIN', otp: '' });
            navigation.reset({ index: 0, routes: [{ name: 'pending_approval', params: { organizationName: data.organizationName } }] });
            return;
          }

          set({ accessToken: data.token, refreshToken: data.refreshToken, nextStep: 'LOGIN', otp: '' });
          connectSocket(data.token);
          navigation.reset({ index: 0, routes: [{ name: 'home' }] });
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
      // Tokens are kept in the Keychain/Keystore, not here. Neither are the
      // OTP or transient UI states.
      partialize: (state) => ({
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

registerSessionHandlers({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onTokensRefreshed: ({ token, refreshToken }) => {
    useAuthStore.setState({ accessToken: token, refreshToken });
  },
  onSessionExpired: () => {
    useAuthStore.getState().clearSession();
    resetToLogin();
  },
});

// Keeps the Keychain/Keystore copy in step with the tokens in memory.
useAuthStore.subscribe((state, previous) => {
  if (
    state.accessToken !== previous.accessToken ||
    state.refreshToken !== previous.refreshToken
  ) {
    saveTokens({ accessToken: state.accessToken, refreshToken: state.refreshToken });
  }
});

/**
 * Loads the tokens before the first screen is chosen. Builds before this one
 * kept tokens in MMKV; those are moved to the Keychain/Keystore and the next
 * MMKV write drops them.
 */
export const restoreSession = async () => {
  const stored = await loadTokens();
  const { accessToken, refreshToken } = useAuthStore.getState();

  if (stored) {
    useAuthStore.setState(stored);
  } else if (accessToken || refreshToken) {
    await saveTokens({ accessToken, refreshToken });
    useAuthStore.setState({ accessToken, refreshToken });
  }
};

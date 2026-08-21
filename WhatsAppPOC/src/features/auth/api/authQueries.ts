import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCountries,
  sendOtp,
  verifyOtp,
  setupProfile,
  setupOrganization,
  getMe,
  Country,
  SendOtpResponse,
  VerifyOtpResponse,
  ProfileSetupData,
  ProfileSetupResponse,
  OrganizationSetupData,
  OrganizationSetupResponse,
  MeResponse,
} from './authApi';

export const authKeys = {
  all: ['auth'] as const,
  countries: () => [...authKeys.all, 'countries'] as const,
  me: (token?: string) => [...authKeys.all, 'me', token] as const,
};

// 1. GET /countries query
export const useCountriesQuery = (enabled: boolean = true) => {
  return useQuery<Country[], Error>({
    queryKey: authKeys.countries(),
    queryFn: () => getCountries(),
    enabled,
    staleTime: 1000 * 60 * 60, // Countries rarely change (1 hr)
  });
};

// 2. POST /auth/send-otp mutation
export const useSendOtpMutation = () => {
  return useMutation<
    SendOtpResponse,
    Error,
    { orgCode: string; countryId: string; mobileNo: string; baseUrl?: string }
  >({
    mutationFn: ({ orgCode, countryId, mobileNo, baseUrl }) =>
      sendOtp(baseUrl || '', orgCode, countryId, mobileNo),
  });
};

// 3. POST /auth/verify-otp mutation
export const useVerifyOtpMutation = () => {
  return useMutation<
    VerifyOtpResponse,
    Error,
    { orgCode: string; countryId: string; mobileNo: string; otp: string; baseUrl?: string }
  >({
    mutationFn: ({ orgCode, countryId, mobileNo, otp, baseUrl }) =>
      verifyOtp(baseUrl || '', orgCode, countryId, mobileNo, otp),
  });
};

// 4. POST /user/profile setup mutation
export const useSetupProfileMutation = () => {
  return useMutation<
    ProfileSetupResponse,
    Error,
    { token: string; data: ProfileSetupData; baseUrl?: string }
  >({
    mutationFn: ({ token, data, baseUrl }) =>
      setupProfile(baseUrl || '', token, data),
  });
};

// 5. POST /organization/setup mutation
export const useSetupOrganizationMutation = () => {
  return useMutation<
    OrganizationSetupResponse,
    Error,
    { token: string; data: OrganizationSetupData; baseUrl?: string }
  >({
    mutationFn: ({ token, data, baseUrl }) =>
      setupOrganization(baseUrl || '', token, data),
  });
};

// 6. GET /auth/me query
export const useMeQuery = (token?: string, enabled: boolean = true) => {
  return useQuery<MeResponse, Error>({
    queryKey: authKeys.me(token),
    queryFn: () => getMe('', token || ''),
    enabled: Boolean(token && token.trim().length > 0 && enabled),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

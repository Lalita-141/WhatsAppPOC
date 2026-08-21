import { environments } from './environment_constant';

const baseUrl = environments.dev;

export const apiPath = {
  // Countries
  countries: baseUrl + 'countries',

  // Authentication
  sendOtp: baseUrl + 'auth/send-otp',
  verifyOtp: baseUrl + 'auth/verify-otp',
  me: baseUrl + 'auth/me',

  // User Profile
  userProfile: baseUrl + 'user/profile',

  // Organization Setup
  orgSetup: baseUrl + 'organization/setup',

  // Contacts
  syncContacts: baseUrl + 'chat/contacts/check',

  // Chat & Messaging
  conversations: baseUrl + 'chat/conversations',
  sendPersonalMessage: baseUrl + 'chat/personal-chat/send',
  personalHistory: baseUrl + 'chat/personal/{userOrganizationId}/messages',
};

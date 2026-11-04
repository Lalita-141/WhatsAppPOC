import { activeBaseUrl } from './environment_constant';

const baseUrl = activeBaseUrl;

// Origin of the API server, for links the server returns as paths.
export const apiOrigin = baseUrl.replace(/\/api\/v1\/?$/, '');

export const apiPath = {
  // Countries
  countries: baseUrl + 'countries',

  // Authentication
  sendOtp: baseUrl + 'auth/send-otp',
  verifyOtp: baseUrl + 'auth/verify-otp',
  me: baseUrl + 'auth/me',
  refresh: baseUrl + 'auth/refresh',
  revoke: baseUrl + 'auth/revoke',
  logoutAll: baseUrl + 'auth/logout-all',
  sessions: baseUrl + 'auth/sessions',
  organizations: baseUrl + 'auth/organizations',
  switchOrganization: baseUrl + 'auth/switch-organization',
  profile: baseUrl + 'user/getProfile',
  updateProfile: baseUrl + 'user/updateProfile',
  privacySettings: baseUrl + 'user/settings/privacy',
  notificationSettings: baseUrl + 'user/settings/notifications',
  account: baseUrl + 'user/account',
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
  personalPinned: baseUrl + 'chat/personal/{userOrganizationId}/pinned',
  conversation: baseUrl + 'chat/conversations/{userOrganizationId}',
  message: baseUrl + 'chat/messages/{messageId}',
  starred: baseUrl + 'chat/starred',
  searchMessages: baseUrl + 'chat/search',
  sync: baseUrl + 'chat/sync',
  blocks: baseUrl + 'user/blocks',
  reports: baseUrl + 'user/reports',

  // Organization administration
  orgSettings: baseUrl + 'organization/settings',
  orgMembers: baseUrl + 'organization/members',
  orgDepartments: baseUrl + 'organization/departments',
  orgInvites: baseUrl + 'organization/invites',
  orgJoinRequests: baseUrl + 'organization/join-requests',
  orgDirectory: baseUrl + 'organization/directory',
  orgRelationships: baseUrl + 'organization/relationships',
  orgAuditLog: baseUrl + 'organization/audit-log',

  // Groups
  groups: baseUrl + 'groups',

  // Status, channels and communities
  status: baseUrl + 'status',
  channels: baseUrl + 'channels',
  communities: baseUrl + 'communities',

  // Broadcasts
  broadcasts: baseUrl + 'broadcasts',

  // Calls
  calls: baseUrl + 'calls',

  // Media
  mediaUploads: baseUrl + 'media/uploads',
  media: baseUrl + 'media',
  userPhoto: baseUrl + 'user/photo',

  // Device & FCM Token
  device: baseUrl + 'user/device',
};

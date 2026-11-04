import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';

export type PrivacyLevel = 'EVERYONE' | 'CONTACTS' | 'NOBODY';

export interface Profile {
  userId: string;
  firstName: string;
  lastName?: string | null;
  mobileNo: string;
  about?: string | null;
  profilePhotoMediaId?: string | null;
}

export interface Membership {
  userOrganizationId: string;
  organizationId: string;
  orgCode: string;
  organizationName: string;
  role?: string | null;
  isCurrent: boolean;
}

export interface Session {
  sessionId: string;
  deviceType?: string | null;
  deviceName?: string | null;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

export interface PrivacySettings {
  aboutPrivacy: PrivacyLevel;
  profilePrivacy: PrivacyLevel;
  lastSeenPrivacy: PrivacyLevel;
  statusPrivacy: PrivacyLevel;
  readReceipts: boolean;
  typingIndicator: boolean;
}

export interface SwitchedSession {
  token: string;
  refreshToken: string;
  userOrganizationId: string;
  organizationId: string;
}

export const getProfile = async (token: string): Promise<Profile> =>
  (await fetchApi('GET', apiPath.profile, token)).data;

export const updateProfile = async (
  token: string,
  changes: { first_name?: string; last_name?: string; about?: string },
): Promise<Profile> => (await fetchApi('PUT', apiPath.updateProfile, token, false, changes)).data;

export const getOrganizations = async (token: string): Promise<Membership[]> =>
  (await fetchApi('GET', apiPath.organizations, token)).data;

export const switchOrganization = async (
  token: string,
  userOrganizationId: string,
): Promise<SwitchedSession> =>
  (await fetchApi('POST', apiPath.switchOrganization, token, false, { userOrganizationId })).data;

export const getSessions = async (token: string): Promise<Session[]> =>
  (await fetchApi('GET', apiPath.sessions, token)).data;

export const revokeSession = async (token: string, sessionId: string) =>
  fetchApi('DELETE', `${apiPath.sessions}/${encodeURIComponent(sessionId)}`, token);

export const logoutAllDevices = async (token: string) =>
  fetchApi('POST', apiPath.logoutAll, token);

export const getPrivacySettings = async (token: string): Promise<PrivacySettings> =>
  (await fetchApi('GET', apiPath.privacySettings, token)).data;

export const updatePrivacySettings = async (
  token: string,
  changes: Partial<PrivacySettings>,
): Promise<PrivacySettings> =>
  (await fetchApi('PUT', apiPath.privacySettings, token, false, changes)).data;

export const deleteAccount = async (token: string) =>
  fetchApi('DELETE', apiPath.account, token, false, { confirmation: 'DELETE' });

export interface NotificationSettings {
  messages: boolean;
  groups: boolean;
  announcements: boolean;
  calls: boolean;
  showPreview: boolean;
}

export const getNotificationSettings = async (token: string): Promise<NotificationSettings> =>
  (await fetchApi('GET', apiPath.notificationSettings, token)).data;

export const updateNotificationSettings = async (token: string, changes: Partial<NotificationSettings>): Promise<NotificationSettings> =>
  (await fetchApi('PUT', apiPath.notificationSettings, token, false, changes)).data;

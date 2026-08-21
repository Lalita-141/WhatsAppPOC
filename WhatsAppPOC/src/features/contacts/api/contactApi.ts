import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';

export interface SyncedContactItem {
  userId: string;
  userOrganizationId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  mobileNo: string;
  about?: string | null;
  profilePhoto?: string | null;
}

export interface SyncContactsResponse {
  success: boolean;
  message: string;
  data: SyncedContactItem[];
}

export const syncContacts = async (
  _apiBaseUrl: string,
  accessToken: string,
  contactsPayload: any
): Promise<SyncContactsResponse> => {
  const result = await fetchApi('POST', apiPath.syncContacts, accessToken, false, contactsPayload);
  return result;
};

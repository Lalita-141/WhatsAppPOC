import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';

export interface SyncContactsResult {
  registered: {
    userId: string;
    userOrganizationId: string;
    name: string;
    phone: string;
  }[];
  notRegistered: {
    name: string;
    phone: string;
  }[];
}

export interface SyncContactsResponse {
  success: boolean;
  message: string;
  data: SyncContactsResult;
}

export const syncContacts = async (
  _apiBaseUrl: string,
  accessToken: string,
  contactsPayload: any
): Promise<SyncContactsResponse> => {
  const result = await fetchApi('POST', apiPath.syncContacts, accessToken, false, contactsPayload);
  return result;
};

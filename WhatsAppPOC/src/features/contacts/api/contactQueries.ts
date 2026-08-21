import { useMutation } from '@tanstack/react-query';
import { syncContacts, SyncContactsResponse } from './contactApi';

export const contactKeys = {
  all: ['contacts'] as const,
  synced: () => [...contactKeys.all, 'synced'] as const,
};

export const useSyncContactsMutation = () => {
  return useMutation<
    SyncContactsResponse,
    Error,
    { baseUrl?: string; accessToken: string; contactsPayload: any }
  >({
    mutationFn: ({ baseUrl, accessToken, contactsPayload }) =>
      syncContacts(baseUrl || '', accessToken, contactsPayload),
  });
};

import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';
import { getLatestAccessToken } from '../../../services/auth/authSession';

export interface CallRecord {
  callId: string;
  type: 'AUDIO' | 'VIDEO';
  direction: 'INCOMING' | 'OUTGOING';
  status: 'RINGING' | 'ONGOING' | 'ENDED' | 'MISSED' | 'REJECTED' | 'CANCELLED' | 'BUSY' | 'FAILED';
  peer: { userOrganizationId: string; name: string; profilePhotoMediaId: string | null };
  startedAt: string;
  durationSeconds: number;
}

export const getCallHistory = async (): Promise<{ calls: CallRecord[]; nextCursor: string | null }> =>
  (await fetchApi('GET', apiPath.calls, getLatestAccessToken())).data;

export const getIceServers = async (): Promise<{ iceServers: { urls: string[]; username?: string; credential?: string }[]; hasTurn: boolean }> =>
  (await fetchApi('GET', `${apiPath.calls}/ice-servers`, getLatestAccessToken())).data;

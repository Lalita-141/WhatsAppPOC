import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';

export interface ReceivedBroadcast {
  broadcastId: string;
  title: string | null;
  message: string;
  isAnnouncement: boolean;
  senderUserOrganizationId: string;
  senderName: string;
  senderOrganizationName: string;
  createdAt: string;
  readAt: string | null;
}

export interface SentBroadcast {
  broadcastId: string;
  title: string | null;
  message: string;
  isAnnouncement: boolean;
  createdAt: string;
  recipients: number;
}

export interface BroadcastTarget { organizationId: string; organizationName: string; isOwn: boolean }

export interface BroadcastStats {
  totals: { recipients: number; delivered: number; read: number };
  organizations: { organizationId: string; organizationName: string; recipients: number; delivered: number; read: number }[];
  ownMembers: { userOrganizationId: string; name: string; deliveredAt: string | null; readAt: string | null }[];
}

export interface NewBroadcast {
  title?: string;
  message: string;
  isAnnouncement: boolean;
  targets: { organizationId: string; departmentIds?: string[] }[];
}

const data = async (promise: Promise<any>) => (await promise).data;

export const getInbox = (t: string): Promise<{ broadcasts: ReceivedBroadcast[]; unreadCount: number }> =>
  data(fetchApi('GET', `${apiPath.broadcasts}/inbox`, t));
export const getSent = (t: string): Promise<{ broadcasts: SentBroadcast[] }> => data(fetchApi('GET', apiPath.broadcasts, t));
export const getTargets = (t: string): Promise<{ canSend: boolean; organizations: BroadcastTarget[] }> =>
  data(fetchApi('GET', `${apiPath.broadcasts}/targets`, t));
export const sendBroadcast = (t: string, body: NewBroadcast): Promise<{ broadcastId: string; recipients: number }> =>
  data(fetchApi('POST', apiPath.broadcasts, t, false, body));
export const getStats = (t: string, id: string): Promise<BroadcastStats> => data(fetchApi('GET', `${apiPath.broadcasts}/${id}/stats`, t));
export const markBroadcastRead = (t: string, id: string) => fetchApi('POST', `${apiPath.broadcasts}/${id}/read`, t);
export const replyToBroadcast = (t: string, id: string, message: string) =>
  fetchApi('POST', `${apiPath.broadcasts}/${id}/reply`, t, false, { message });

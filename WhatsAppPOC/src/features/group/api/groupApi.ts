import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';
import { MuteOption } from '../../chat/api/chatApi';
import { MediaInfo } from '../../../services/media/mediaService';

export interface GroupMessage {
  messageId: string;
  groupId: string;
  clientMessageId?: string | null;
  senderUserOrganizationId: string;
  senderName: string;
  message: string | null;
  messageType: 'TEXT' | 'SYSTEM' | string;
  media?: MediaInfo | null;
  sendTime: string;
  isMine: boolean;
  forwarded: boolean;
  isDeleted: boolean;
  status: string;
  replyTo: { messageId: string; senderUserOrganizationId: string; senderName: string; message: string | null; isDeleted: boolean } | null;
}

export interface GroupSummary {
  groupId: string;
  name: string;
  description: string | null;
  icon: string | null;
  lastMessage: GroupMessage | null;
  unreadCount: number;
  isAdmin: boolean;
  isPinned: boolean;
  isArchived: boolean;
  mutedUntil: string | null;
  onlyAdminsCanSend: boolean;
}

export interface GroupMember {
  userOrganizationId: string;
  name: string;
  role: 'ADMIN' | 'USER';
  organizationName: string | null;
  isSuspended: boolean;
  isYou: boolean;
}

export interface GroupInfo extends GroupSummary {
  onlyAdminsCanEditInfo: boolean;
  inviteCode: string | null;
  createdAt: string;
  members: GroupMember[];
}

const base = apiPath.groups;
const data = async (promise: Promise<any>) => (await promise).data;

export const listGroups = (t: string): Promise<GroupSummary[]> => data(fetchApi('GET', base, t));
export const createGroup = (t: string, name: string, memberIds: string[], description?: string): Promise<GroupInfo> =>
  data(fetchApi('POST', base, t, false, { name, memberIds, description }));
export const getGroup = (t: string, id: string): Promise<GroupInfo> => data(fetchApi('GET', `${base}/${id}`, t));
export const updateGroup = (t: string, id: string, changes: Partial<{ name: string; description: string | null; onlyAdminsCanSend: boolean; onlyAdminsCanEditInfo: boolean }>): Promise<GroupInfo> =>
  data(fetchApi('PATCH', `${base}/${id}`, t, false, changes));
export const deleteGroup = (t: string, id: string) => fetchApi('DELETE', `${base}/${id}`, t);
export const addMembers = (t: string, id: string, userOrganizationIds: string[]): Promise<GroupInfo> =>
  data(fetchApi('POST', `${base}/${id}/members`, t, false, { userOrganizationIds }));
export const removeMember = (t: string, id: string, memberId: string) => fetchApi('DELETE', `${base}/${id}/members/${memberId}`, t);
export const setRole = (t: string, id: string, memberId: string, role: 'ADMIN' | 'USER') =>
  fetchApi('PATCH', `${base}/${id}/members/${memberId}`, t, false, { role });
export const leaveGroup = (t: string, id: string) => fetchApi('POST', `${base}/${id}/leave`, t);
export const createInviteLink = (t: string, id: string): Promise<{ inviteCode: string }> => data(fetchApi('POST', `${base}/${id}/invite-link`, t));
export const revokeInviteLink = (t: string, id: string) => fetchApi('DELETE', `${base}/${id}/invite-link`, t);
export const joinGroup = (t: string, code: string): Promise<GroupInfo> => data(fetchApi('POST', `${base}/join/${encodeURIComponent(code)}`, t));
export const setGroupPreferences = (t: string, id: string, changes: { muted?: MuteOption; pinned?: boolean; archived?: boolean }): Promise<GroupSummary> =>
  data(fetchApi('PATCH', `${base}/${id}/preferences`, t, false, changes));
export const getGroupMessages = (t: string, id: string, before?: string | null): Promise<{ messages: GroupMessage[]; pagination: { hasMore: boolean; nextCursor: string | null } }> =>
  data(fetchApi('GET', `${base}/${id}/messages?limit=30${before ? `&beforeChatId=${before}` : ''}`, t));
export const deleteGroupMessage = (t: string, id: string, messageId: string) => fetchApi('DELETE', `${base}/${id}/messages/${messageId}`, t);
export const getReceipts = (t: string, id: string, messageId: string): Promise<{ userOrganizationId: string; name: string; deliveredAt: string | null; readAt: string | null }[]> =>
  data(fetchApi('GET', `${base}/${id}/messages/${messageId}/receipts`, t));
export const forwardGroupMessage = (t: string, id: string, messageId: string, targets: { receiverUserOrganizationIds?: string[]; groupIds?: string[] }) =>
  fetchApi('POST', `${base}/${id}/messages/${messageId}/forward`, t, false, targets);
export const searchGroup = (t: string, id: string, q: string): Promise<GroupMessage[]> =>
  data(fetchApi('GET', `${base}/${id}/search?q=${encodeURIComponent(q)}`, t));

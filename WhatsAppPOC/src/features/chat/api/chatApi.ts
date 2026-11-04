import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';
import { MediaInfo } from '../../../services/media/mediaService';

export type MessageStatus = 'SENDING' | 'FAILED' | 'SENT' | 'DELIVERED' | 'SEEN';

/** A message as the server describes it to this viewer. */
export interface ApiChatMessage {
  messageId: string;
  clientMessageId?: string | null;
  senderUserOrganizationId: string;
  receiverUserOrganizationId: string;
  message: string | null;
  messageType?: string;
  media?: MediaInfo | null;
  sendTime: string;
  receiveTime?: string | null;
  readTime?: string | null;
  status: MessageStatus | string;
  isMine: boolean;
  isSelf?: boolean;
  forwarded?: boolean;
  editedAt?: string | null;
  isDeleted?: boolean;
  pinnedAt?: string | null;
  isStarred?: boolean;
  replyTo?: {
    messageId: string;
    senderUserOrganizationId: string;
    message: string | null;
    isDeleted: boolean;
  } | null;
  reactions?: { emoji: string; userOrganizationId: string }[];
}

export type LastMessage = ApiChatMessage;

export interface Conversation {
  userOrganizationId: string;
  userId: string;
  name: string;
  firstName: string;
  lastName?: string | null;
  mobileNo: string;
  profilePhoto?: string | null;
  profilePhotoMediaId?: string | null;
  about?: string | null;
  lastSeen?: string | null;
  lastMessage?: LastMessage | null;
  unreadCount?: number;
  isSelf?: boolean;
  isPinned?: boolean;
  mutedUntil?: string | null;
  isArchived?: boolean;
  isBlocked?: boolean;
  isDeletedAccount?: boolean;
}

export interface Pagination {
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

export interface ConversationsPage {
  conversations: Conversation[];
  pagination: Pagination;
}

export interface ChatHistoryResult {
  messages: ApiChatMessage[];
  pagination?: Pagination;
}

export type MuteOption = '8h' | '1w' | 'forever' | false;

const withId = (template: string, key: string, value: string) =>
  template.replace(`{${key}}`, encodeURIComponent(String(value).trim()));

const messageUrl = (messageId: string, suffix = '') =>
  withId(apiPath.message, 'messageId', messageId) + suffix;

export const getConversations = async (
  accessToken?: string,
  options: { cursor?: string | null; archived?: boolean; limit?: number } = {},
): Promise<ConversationsPage> => {
  const params = [`limit=${options.limit ?? 30}`];
  if (options.cursor) params.push(`cursor=${encodeURIComponent(options.cursor)}`);
  if (options.archived) params.push('archived=true');
  const result = await fetchApi('GET', `${apiPath.conversations}?${params.join('&')}`, accessToken);
  return result.data;
};

export const updateConversation = async (
  accessToken: string,
  peerUserOrganizationId: string,
  changes: { pinned?: boolean; muted?: MuteOption; archived?: boolean },
): Promise<Conversation> =>
  (await fetchApi('PATCH', withId(apiPath.conversation, 'userOrganizationId', peerUserOrganizationId), accessToken, false, changes)).data;

export const getPersonalChatHistory = async (
  _apiBaseUrl: string,
  accessToken: string,
  userOrganizationId: string,
  beforeChatId?: string | null,
  limit: number = 30,
): Promise<ChatHistoryResult> => {
  let url = withId(apiPath.personalHistory, 'userOrganizationId', userOrganizationId) + `?limit=${limit}`;
  if (beforeChatId) {
    url += `&beforeChatId=${encodeURIComponent(beforeChatId)}`;
  }
  const result = await fetchApi('GET', url, accessToken);
  return {
    messages: result.data?.messages || [],
    pagination: result.data?.pagination,
  };
};

export const getPinnedMessages = async (accessToken: string, userOrganizationId: string): Promise<ApiChatMessage[]> =>
  (await fetchApi('GET', withId(apiPath.personalPinned, 'userOrganizationId', userOrganizationId), accessToken)).data;

export const editMessage = async (accessToken: string, messageId: string, message: string): Promise<ApiChatMessage> =>
  (await fetchApi('PATCH', messageUrl(messageId), accessToken, false, { message })).data;

export const deleteMessage = async (accessToken: string, messageId: string, scope: 'me' | 'everyone') =>
  fetchApi('DELETE', messageUrl(messageId, `?scope=${scope}`), accessToken);

export const setReaction = async (accessToken: string, messageId: string, emoji: string | null) =>
  emoji
    ? fetchApi('PUT', messageUrl(messageId, '/reaction'), accessToken, false, { emoji })
    : fetchApi('DELETE', messageUrl(messageId, '/reaction'), accessToken);

export const setStarred = async (accessToken: string, messageId: string, starred: boolean) =>
  fetchApi(starred ? 'PUT' : 'DELETE', messageUrl(messageId, '/star'), accessToken);

export const setPinned = async (accessToken: string, messageId: string, pinned: boolean) =>
  fetchApi(pinned ? 'PUT' : 'DELETE', messageUrl(messageId, '/pin'), accessToken);

export interface ForwardTargets {
  receiverUserOrganizationIds: string[];
  groupIds: string[];
}

export const forwardMessage = async (accessToken: string, messageId: string, targets: ForwardTargets) =>
  (await fetchApi('POST', messageUrl(messageId, '/forward'), accessToken, false, targets)).data;

export const getStarredMessages = async (accessToken: string, cursor?: string | null): Promise<ChatHistoryResult> =>
  (await fetchApi('GET', `${apiPath.starred}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, accessToken)).data;

export const searchMessages = async (
  accessToken: string,
  query: string,
  withUserOrganizationId?: string,
): Promise<ChatHistoryResult> => {
  const params = [`q=${encodeURIComponent(query)}`];
  if (withUserOrganizationId) params.push(`with=${encodeURIComponent(withUserOrganizationId)}`);
  return (await fetchApi('GET', `${apiPath.searchMessages}?${params.join('&')}`, accessToken)).data;
};

export const syncMessages = async (
  accessToken: string,
  afterMessageId: string,
): Promise<{ messages: ApiChatMessage[]; hasMore: boolean; lastMessageId: string }> =>
  (await fetchApi('GET', `${apiPath.sync}?after=${encodeURIComponent(afterMessageId)}&limit=200`, accessToken)).data;

export interface BlockedUser {
  userOrganizationId: string;
  name: string;
  mobileNo: string;
  blockedAt: string;
}

export const getBlockedUsers = async (accessToken: string): Promise<BlockedUser[]> =>
  (await fetchApi('GET', apiPath.blocks, accessToken)).data;

export const blockUser = async (accessToken: string, userOrganizationId: string) =>
  fetchApi('POST', apiPath.blocks, accessToken, false, { userOrganizationId });

export const unblockUser = async (accessToken: string, userOrganizationId: string) =>
  fetchApi('DELETE', `${apiPath.blocks}/${encodeURIComponent(userOrganizationId)}`, accessToken);

export type ReportReason = 'SPAM' | 'HARASSMENT' | 'INAPPROPRIATE' | 'SCAM' | 'OTHER';

export const reportUser = async (
  accessToken: string,
  report: { userOrganizationId: string; reason: ReportReason; messageId?: string; block?: boolean },
) => (await fetchApi('POST', apiPath.reports, accessToken, false, report)).data;

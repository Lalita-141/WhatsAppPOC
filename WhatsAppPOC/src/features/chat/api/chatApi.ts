export interface LastMessage {
  chatId: string;
  senderUserOrganizationId?: string;
  receiverUserOrganizationId?: string;
  message: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | string;
  sendTime: string;
}

export interface Conversation {
  userOrganizationId: string;
  userId: string;
  name: string;
  firstName: string;
  lastName?: string;
  mobileNo: string;
  profilePhoto?: string | null;
  about?: string | null;
  lastSeen?: string | null;
  lastMessage?: LastMessage | null;
}

export interface ConversationsResponse {
  success: boolean;
  message: string;
  data: Conversation[];
}

export interface SendMessagePayload {
  receiverUserOrganizationId: string;
  message: string;
}

export interface SentMessageData {
  chatId: string;
  senderUserOrganizationId: string;
  receiverUserOrganizationId: string;
  message: string;
  status: string;
  sendTime: string;
}

export interface SendMessageResponse {
  success: boolean;
  message: string;
  data: SentMessageData;
}

import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';

// Fetch all active conversations for the current authenticated user
export const getConversations = async (
  _apiBaseUrl?: string,
  accessToken?: string
): Promise<Conversation[]> => {
  const result: ConversationsResponse = await fetchApi('GET', apiPath.conversations, accessToken);
  return result.data || [];
};

// Send a personal chat message to a specific recipient by receiverUserOrganizationId
export const sendPersonalMessage = async (
  _apiBaseUrl: string,
  accessToken: string,
  receiverUserOrganizationId: string,
  message: string
): Promise<SentMessageData> => {
  const result: SendMessageResponse = await fetchApi('POST', apiPath.sendPersonalMessage, accessToken, false, {
    receiverUserOrganizationId: String(receiverUserOrganizationId).trim(),
    message: message.trim(),
  });
  return result.data;
};

export interface ApiChatMessage {
  messageId: string;
  senderUserOrganizationId: string;
  receiverUserOrganizationId: string;
  message: string;
  media?: string;
  sendTime: string;
  receiveTime?: string | null;
  status: 'SENT' | 'DELIVERED' | 'READ' | string;
  isMine: boolean;
}

export interface ChatHistoryPagination {
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

export interface ChatHistoryResponse {
  success: boolean;
  message: string;
  data: {
    messages: ApiChatMessage[];
    pagination?: ChatHistoryPagination;
  };
}

export interface ChatHistoryResult {
  messages: ApiChatMessage[];
  pagination?: ChatHistoryPagination;
}

// Fetch chat history between current authenticated user and specific userOrganizationId with beforeChatId pagination
export const getPersonalChatHistory = async (
  _apiBaseUrl: string,
  accessToken: string,
  userOrganizationId: string,
  beforeChatId?: string | null,
  limit: number = 30
): Promise<ChatHistoryResult> => {
  let url = apiPath.personalHistory.replace('{userOrganizationId}', String(userOrganizationId).trim()) + `?limit=${limit}`;
  if (beforeChatId) {
    url += `&beforeChatId=${encodeURIComponent(beforeChatId)}`;
  }
  const result: ChatHistoryResponse = await fetchApi('GET', url, accessToken);
  return {
    messages: result.data?.messages || [],
    pagination: result.data?.pagination,
  };
};

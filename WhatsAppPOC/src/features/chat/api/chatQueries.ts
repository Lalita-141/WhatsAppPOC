import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getConversations,
  sendPersonalMessage,
  getPersonalChatHistory,
  Conversation,
  SentMessageData,
  ChatHistoryResult,
} from './chatApi';

export const chatKeys = {
  all: ['chat'] as const,
  conversations: (token?: string) => [...chatKeys.all, 'conversations', token] as const,
  history: (userOrgId: string, beforeChatId?: string | null) =>
    [...chatKeys.all, 'history', userOrgId, beforeChatId || 'latest'] as const,
};

// 1. GET /chat/conversations query
export const useConversationsQuery = (accessToken?: string, enabled: boolean = true) => {
  return useQuery<Conversation[], Error>({
    queryKey: chatKeys.conversations(accessToken),
    queryFn: () => getConversations('', accessToken),
    enabled: Boolean(accessToken && accessToken.trim().length > 0 && enabled),
    staleTime: 1000 * 15, // 15 seconds
  });
};

// 2. POST /chat/personal-chat/send mutation
export const useSendPersonalMessageMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<
    SentMessageData,
    Error,
    {
      baseUrl?: string;
      accessToken: string;
      receiverUserOrganizationId: string;
      message: string;
    }
  >({
    mutationFn: ({ baseUrl, accessToken, receiverUserOrganizationId, message }) =>
      sendPersonalMessage(baseUrl || '', accessToken, receiverUserOrganizationId, message),
    onSuccess: () => {
      // Invalidate conversations list so latest message & ordering refresh
      queryClient.invalidateQueries({ queryKey: chatKeys.all });
    },
  });
};

// 3. GET /chat/personal/:userOrganizationId/messages query
export const usePersonalChatHistoryQuery = (
  accessToken?: string,
  userOrganizationId?: string,
  beforeChatId?: string | null,
  limit: number = 30,
  enabled: boolean = true
) => {
  return useQuery<ChatHistoryResult, Error>({
    queryKey: chatKeys.history(userOrganizationId || '', beforeChatId),
    queryFn: () =>
      getPersonalChatHistory('', accessToken || '', userOrganizationId || '', beforeChatId, limit),
    enabled: Boolean(
      accessToken &&
        userOrganizationId &&
        userOrganizationId.trim().length > 0 &&
        enabled
    ),
    staleTime: 1000 * 10, // 10 seconds
  });
};

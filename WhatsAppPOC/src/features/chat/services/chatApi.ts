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

// Fetch all active conversations for the current authenticated user
export const getConversations = async (
  apiBaseUrl: string,
  accessToken: string
): Promise<Conversation[]> => {
  const url = `${apiBaseUrl}/chat/conversations`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    try {
      const errorData = JSON.parse(responseText);
      throw new Error(errorData.message || 'Failed to fetch conversations');
    } catch (e: any) {
      throw new Error(e.message || `Server returned ${response.status}: Failed to fetch conversations`);
    }
  }

  try {
    const result: ConversationsResponse = JSON.parse(responseText);
    return result.data || [];
  } catch (e) {
    throw new Error('Server returned invalid JSON response');
  }
};

// Send a personal chat message to a specific recipient by receiverUserOrganizationId
export const sendPersonalMessage = async (
  apiBaseUrl: string,
  accessToken: string,
  receiverUserOrganizationId: string,
  message: string
): Promise<SentMessageData> => {
  const url = `${apiBaseUrl}/chat/personal-chat/send`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      receiverUserOrganizationId: String(receiverUserOrganizationId).trim(),
      message: message.trim(),
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    try {
      const errorData = JSON.parse(responseText);
      throw new Error(errorData.message || 'Failed to send message');
    } catch (e: any) {
      throw new Error(e.message || `Server returned ${response.status}: Failed to send message`);
    }
  }

  try {
    const result: SendMessageResponse = JSON.parse(responseText);
    return result.data;
  } catch (e) {
    throw new Error('Server returned invalid JSON response');
  }
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
  apiBaseUrl: string,
  accessToken: string,
  userOrganizationId: string,
  beforeChatId?: string | null,
  limit: number = 30
): Promise<ChatHistoryResult> => {
  let url = `${apiBaseUrl}/chat/personal/${String(userOrganizationId).trim()}/messages?limit=${limit}`;
  if (beforeChatId) {
    url += `&beforeChatId=${encodeURIComponent(beforeChatId)}`;
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    try {
      const errorData = JSON.parse(responseText);
      throw new Error(errorData.message || 'Failed to fetch chat history');
    } catch (e: any) {
      throw new Error(e.message || `Server returned ${response.status}: Failed to fetch chat history`);
    }
  }

  try {
    const result: ChatHistoryResponse = JSON.parse(responseText);
    return {
      messages: result.data?.messages || [],
      pagination: result.data?.pagination,
    };
  } catch (e) {
    throw new Error('Server returned invalid JSON response');
  }
};



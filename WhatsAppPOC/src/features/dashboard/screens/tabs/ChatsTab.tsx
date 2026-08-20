import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../../../../core/theme';
import { getConversations, Conversation, LastMessage } from '../../../chat/services/chatApi';
import { ChatRecipient } from '../../../chat/screens/ChatScreen';

const AVATAR_COLORS = [
  '#25D366',
  '#00A884',
  '#5C6BC0',
  '#26A69A',
  '#EC407A',
  '#FFA726',
  '#AB47BC',
  '#29B6F6',
];

const getAvatarBg = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

interface ChatsTabProps {
  apiBaseUrl?: string;
  accessToken?: string;
  onOpenChat?: (recipient: ChatRecipient, initialLastMessage?: LastMessage | null) => void;
  onOpenContacts?: () => void;
}

export const ChatsTab: React.FC<ChatsTabProps> = ({
  apiBaseUrl,
  accessToken,
  onOpenChat,
  onOpenContacts,
}) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchChatConversations = useCallback(async (isRefresh = false) => {
    if (!apiBaseUrl || !accessToken) return;

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setFetchError(null);

    try {
      const data = await getConversations(apiBaseUrl, accessToken);
      setConversations(data || []);
    } catch (err: any) {
      console.warn('Failed to fetch conversations from API:', err);
      setFetchError(err.message || 'Could not load conversations');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [apiBaseUrl, accessToken]);

  useEffect(() => {
    fetchChatConversations();
  }, [fetchChatConversations]);

  const filteredConversations = conversations.filter(conv => {
    const q = searchQuery.toLowerCase();
    const nameMatch = conv.name?.toLowerCase().includes(q) ||
      `${conv.firstName || ''} ${conv.lastName || ''}`.toLowerCase().includes(q);
    const phoneMatch = conv.mobileNo?.includes(q);
    const messageMatch = conv.lastMessage?.message?.toLowerCase().includes(q);
    return nameMatch || phoneMatch || messageMatch;
  });

  const formatConversationTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      }
      return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  const renderCheckmarks = (status?: string) => {
    if (!status) return null;
    switch (status.toUpperCase()) {
      case 'SENT':
        return <Text style={{ color: theme.placeholder, fontSize: 13, marginRight: 2 }}>✓</Text>;
      case 'DELIVERED':
        return <Text style={{ color: theme.placeholder, fontSize: 13, marginRight: 2 }}>✓✓</Text>;
      case 'READ':
        return <Text style={{ color: '#53BDEB', fontSize: 13, marginRight: 2 }}>✓✓</Text>;
      default:
        return <Text style={{ color: theme.placeholder, fontSize: 13, marginRight: 2 }}>✓</Text>;
    }
  };

  const handleChatPress = (conv: Conversation) => {
    if (onOpenChat) {
      onOpenChat(
        {
          userOrganizationId: conv.userOrganizationId,
          name: conv.name || `${conv.firstName || ''} ${conv.lastName || ''}`.trim() || conv.mobileNo,
          mobileNo: conv.mobileNo,
          about: conv.about,
          profilePhoto: conv.profilePhoto,
        },
        conv.lastMessage
      );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.placeholder, fontSize: 16, marginRight: 8 }}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search conversations..."
            placeholderTextColor={theme.placeholder}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={{ color: theme.placeholder, fontSize: 14, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Loading Indicator */}
      {isLoading && conversations.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading conversations...
          </Text>
        </View>
      ) : (
        /* Conversation List */
        <ScrollView
          contentContainerStyle={styles.chatListContainer}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchChatConversations(true)}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          {filteredConversations.length > 0 ? (
            filteredConversations.map((conv) => {
              const displayName =
                conv.name ||
                `${conv.firstName || ''} ${conv.lastName || ''}`.trim() ||
                conv.mobileNo;
              const avatarLetter = displayName ? displayName.charAt(0).toUpperCase() : '?';
              const avatarColor = getAvatarBg(displayName);
              const lastMsgText = conv.lastMessage?.message || conv.about || 'Tap to chat';
              const timeString = formatConversationTime(conv.lastMessage?.sendTime);

              return (
                <TouchableOpacity
                  key={conv.userOrganizationId || conv.userId}
                  style={[styles.chatItem, { borderBottomColor: theme.border }]}
                  onPress={() => handleChatPress(conv)}
                >
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                    <Text style={styles.avatarText}>{avatarLetter}</Text>
                  </View>

                  {/* Middle Details */}
                  <View style={styles.chatDetails}>
                    <Text style={[styles.chatName, { color: theme.text }]} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <View style={styles.messageRow}>
                      {renderCheckmarks(conv.lastMessage?.status)}
                      <Text
                        style={[styles.lastMessage, { color: theme.textSecondary }]}
                        numberOfLines={1}
                      >
                        {lastMsgText}
                      </Text>
                    </View>
                  </View>

                  {/* Right Meta Info */}
                  <View style={styles.chatMeta}>
                    <Text style={[styles.timeText, { color: theme.textSecondary }]}>
                      {timeString}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Conversations Yet</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                {searchQuery
                  ? `No conversation matches "${searchQuery}"`
                  : 'Start a conversation with your registered contacts'}
              </Text>
              {onOpenContacts && !searchQuery && (
                <TouchableOpacity
                  style={[styles.startChatBtn, { backgroundColor: theme.primary }]}
                  onPress={onOpenContacts}
                >
                  <Text style={[styles.startChatBtnText, { color: theme.surface }]}>
                    Start a Chat
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchBar: {
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    padding: 0,
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  chatListContainer: {
    paddingBottom: 80,
    flexGrow: 1,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  chatDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  chatName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 13,
    flex: 1,
  },
  chatMeta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  startChatBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  startChatBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

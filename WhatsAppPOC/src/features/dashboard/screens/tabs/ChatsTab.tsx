import React, { useEffect, useState } from 'react';
import {
  Alert,
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
import {
  ApiChatMessage,
  Conversation,
  LastMessage,
  MuteOption,
  searchMessages,
  updateConversation,
} from '../../../chat/api/chatApi';
import { useConversationsQuery } from '../../../chat/api/chatQueries';
import { ChatRecipient } from '../../../chat/screens/ChatScreen';
import { socket } from '../../../../services/socket';
import { GroupSummary, listGroups, setGroupPreferences } from '../../../group/api/groupApi';
import { attachmentLabel } from '../../../../services/media/mediaService';
import { Avatar } from '../../../../components/media/Avatar';

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

const SELF_CHAT_NAME = 'You';
const SELF_CHAT_HINT = 'Message yourself';

interface ChatsTabProps {
  apiBaseUrl?: string;
  accessToken?: string;
  onOpenChat?: (recipient: ChatRecipient, initialLastMessage?: LastMessage | null) => void;
  onOpenGroup?: (groupId: string, name: string) => void;
  onOpenContacts?: () => void;
}

export const ChatsTab: React.FC<ChatsTabProps> = ({
  accessToken,
  onOpenChat,
  onOpenGroup,
  onOpenContacts,
}) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [messageHits, setMessageHits] = useState<ApiChatMessage[]>([]);

  // TanStack Query for Conversations
  const {
    data: conversationsData,
    isLoading,
    isRefetching: isRefreshing,
    error: fetchErrorObj,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useConversationsQuery(accessToken, Boolean(accessToken), showArchived);

  const conversations = conversationsData || [];

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const loadGroups = React.useCallback(() => {
    if (accessToken) listGroups(accessToken).then(setGroups).catch(() => undefined);
  }, [accessToken]);

  useEffect(() => {
    loadGroups();
    const events = ['group:message:new', 'group:updated', 'group:added', 'group:removed'];
    events.forEach((event) => socket.on(event, loadGroups));
    return () => events.forEach((event) => socket.off(event, loadGroups));
  }, [loadGroups]);

  const visibleGroups = groups.filter(
    (g) =>
      g.isArchived === showArchived &&
      (!unreadOnly || g.unreadCount > 0) &&
      (!searchQuery || g.name.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const openGroupOptions = (group: GroupSummary) =>
    Alert.alert(group.name, undefined, [
      { text: group.isPinned ? 'Unpin' : 'Pin', onPress: () => setGroupPreferences(accessToken!, group.groupId, { pinned: !group.isPinned }).then(loadGroups) },
      group.mutedUntil
        ? { text: 'Unmute', onPress: () => setGroupPreferences(accessToken!, group.groupId, { muted: false }).then(loadGroups) }
        : { text: 'Mute', onPress: () => setGroupPreferences(accessToken!, group.groupId, { muted: 'forever' }).then(loadGroups) },
      { text: group.isArchived ? 'Unarchive' : 'Archive', onPress: () => setGroupPreferences(accessToken!, group.groupId, { archived: !group.isArchived }).then(loadGroups) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  // Message search runs on the server once the query is long enough.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!accessToken || q.length < 2) {
      setMessageHits([]);
      return;
    }
    const timer = setTimeout(() => {
      searchMessages(accessToken, q)
        .then((result) => setMessageHits(result.messages))
        .catch(() => setMessageHits([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [accessToken, searchQuery]);

  const changeConversation = (conv: Conversation, changes: { pinned?: boolean; muted?: MuteOption; archived?: boolean }) => {
    if (!accessToken) return;
    updateConversation(accessToken, conv.userOrganizationId, changes)
      .then(() => refetch())
      .catch((err) => Alert.alert('Could not update chat', err?.message || 'Please try again.'));
  };

  const openChatOptions = (conv: Conversation) => {
    const isMuted = Boolean(conv.mutedUntil);
    Alert.alert(conv.isSelf ? SELF_CHAT_NAME : conv.name || conv.mobileNo, undefined, [
      { text: conv.isPinned ? 'Unpin chat' : 'Pin chat', onPress: () => changeConversation(conv, { pinned: !conv.isPinned }) },
      ...(!conv.isSelf
        ? [
            isMuted
              ? { text: 'Unmute', onPress: () => changeConversation(conv, { muted: false }) }
              : {
                  text: 'Mute',
                  onPress: () =>
                    Alert.alert('Mute notifications', undefined, [
                      { text: '8 hours', onPress: () => changeConversation(conv, { muted: '8h' }) },
                      { text: '1 week', onPress: () => changeConversation(conv, { muted: '1w' }) },
                      { text: 'Always', onPress: () => changeConversation(conv, { muted: 'forever' }) },
                      { text: 'Cancel', style: 'cancel' as const },
                    ]),
                },
          ]
        : []),
      { text: conv.isArchived ? 'Unarchive chat' : 'Archive chat', onPress: () => changeConversation(conv, { archived: !conv.isArchived }) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const handleNewMessage = (message: any) => {

      // --------------------------------------------------
      // 1. Tell backend that receiver received the message
      // --------------------------------------------------
      if (
        message?.messageId &&
        !message.isMine &&
        message.status === 'SENT'
      ) {
        socket.emit("message:delivered", {
          messageId: message.messageId,
        });

      }

      // --------------------------------------------------
      // 2. Refresh conversation list
      // --------------------------------------------------
      refetch();
    };

    const handleMessageDelivered = (message: any) => {

      // Update latest message status in conversation list
      refetch();
    };

    const handleMessageRead = (message: any) => {

      // Update latest message status to read/seen in conversation list
      refetch();
    };

    socket.on("message:new", handleNewMessage);
    socket.on("conversation:updated", handleMessageRead);
    socket.on("message:updated", handleMessageRead);

    socket.on(
      "message:delivered",
      handleMessageDelivered
    );

    socket.on(
      "message:read",
      handleMessageRead
    );

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:updated", handleMessageRead);
      socket.off("message:updated", handleMessageRead);

      socket.off(
        "message:delivered",
        handleMessageDelivered
      );

      socket.off(
        "message:read",
        handleMessageRead
      );
    };
  }, [accessToken, refetch]);
  const fetchError = fetchErrorObj ? fetchErrorObj.message : null;

  const filteredConversations = conversations.filter(conv => {
    if (unreadOnly && !conv.unreadCount) {
      return false;
    }
    const q = searchQuery.toLowerCase();
    if (conv.isSelf && SELF_CHAT_NAME.toLowerCase().includes(q)) {
      return true;
    }
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
      case 'SEEN':
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
          name: conv.isSelf
            ? SELF_CHAT_NAME
            : conv.name || `${conv.firstName || ''} ${conv.lastName || ''}`.trim() || conv.mobileNo,
          isSelf: conv.isSelf,
          isBlocked: conv.isBlocked,
          profilePhotoMediaId: conv.profilePhotoMediaId,
          mutedUntil: conv.mutedUntil,
          mobileNo: conv.mobileNo,
          about: conv.about,
          profilePhoto: conv.profilePhoto,
          lastSeen: conv.lastSeen,
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

      {/* Filters */}
      <View style={styles.filterRow}>
        {showArchived ? (
          <TouchableOpacity onPress={() => setShowArchived(false)} style={[styles.chip, { backgroundColor: theme.surface }]}>
            <Text style={{ color: theme.text, fontWeight: '600' }}>← Archived chats</Text>
          </TouchableOpacity>
        ) : (
          ([['All', false], ['Unread', true]] as const).map(([label, value]) => (
            <TouchableOpacity
              key={label}
              onPress={() => setUnreadOnly(value)}
              style={[styles.chip, { backgroundColor: unreadOnly === value ? theme.primary : theme.surface }]}
              accessibilityState={{ selected: unreadOnly === value }}
            >
              <Text style={{ color: unreadOnly === value ? theme.surface : theme.text, fontWeight: '600' }}>{label}</Text>
            </TouchableOpacity>
          ))
        )}
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
              onRefresh={() => {
                refetch();
              }}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          {fetchError && conversations.length === 0 && (
            <TouchableOpacity style={[styles.archivedRow, { borderBottomColor: theme.border }]} onPress={() => refetch()}>
              <Text style={{ color: theme.error }}>Could not load chats: {fetchError}</Text>
              <Text style={{ color: theme.primary, marginTop: 4, fontWeight: '600' }}>Tap to try again</Text>
            </TouchableOpacity>
          )}
          {!showArchived && !searchQuery && (
            <TouchableOpacity
              style={[styles.archivedRow, { borderBottomColor: theme.border }]}
              onPress={() => setShowArchived(true)}
            >
              <Text style={{ color: theme.textSecondary, fontSize: 15 }}>🗄  Archived</Text>
            </TouchableOpacity>
          )}
          {visibleGroups.map((group) => (
            <TouchableOpacity
              key={`group-${group.groupId}`}
              style={[styles.chatItem, { borderBottomColor: theme.border }]}
              onPress={() => onOpenGroup?.(group.groupId, group.name)}
              onLongPress={() => openGroupOptions(group)}
              delayLongPress={300}
            >
              <View style={[styles.avatar, { backgroundColor: getAvatarBg(group.name) }]}>
                <Text style={styles.avatarText}>👥</Text>
              </View>
              <View style={styles.chatDetails}>
                <Text style={[styles.chatName, { color: theme.text }]} numberOfLines={1}>{group.name}</Text>
                <Text style={[styles.lastMessage, { color: theme.textSecondary }]} numberOfLines={1}>
                  {group.lastMessage
                    ? group.lastMessage.isDeleted
                      ? '🚫 This message was deleted'
                      : group.lastMessage.messageType === 'SYSTEM'
                      ? group.lastMessage.message
                      : `${group.lastMessage.isMine ? 'You' : group.lastMessage.senderName}: ${group.lastMessage.message || attachmentLabel(group.lastMessage.messageType) || ''}`
                    : 'No messages yet'}
                </Text>
              </View>
              <View style={styles.chatMeta}>
                <Text style={[styles.timeText, { color: group.unreadCount ? theme.primary : theme.textSecondary }]}>
                  {formatConversationTime(group.lastMessage?.sendTime)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                  {group.mutedUntil && <Text style={{ fontSize: 12, color: theme.textSecondary }}>🔕</Text>}
                  {group.isPinned && <Text style={{ fontSize: 12, color: theme.textSecondary }}>📌</Text>}
                </View>
                {group.unreadCount > 0 && (
                  <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.unreadBadgeText}>{group.unreadCount > 99 ? '99+' : group.unreadCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
          {filteredConversations.length > 0 || visibleGroups.length > 0 ? (
            filteredConversations.map((conv) => {
              const displayName = conv.isSelf
                ? SELF_CHAT_NAME
                : conv.name ||
                  `${conv.firstName || ''} ${conv.lastName || ''}`.trim() ||
                  conv.mobileNo;
              const lastMsgText =
                (conv.lastMessage?.isDeleted ? '🚫 This message was deleted' : null) ||
                conv.lastMessage?.message ||
                attachmentLabel(conv.lastMessage?.messageType) ||
                (conv.isSelf ? SELF_CHAT_HINT : conv.about || 'Tap to chat');
              const timeString = formatConversationTime(conv.lastMessage?.sendTime);

              return (
                <TouchableOpacity
                  key={conv.userOrganizationId || conv.userId}
                  style={[styles.chatItem, { borderBottomColor: theme.border }]}
                  onPress={() => handleChatPress(conv)}
                  onLongPress={() => openChatOptions(conv)}
                  delayLongPress={300}
                >
                  {/* Avatar */}
                  <View style={styles.avatar}>
                    <Avatar name={displayName} mediaId={conv.profilePhotoMediaId} />
                  </View>

                  {/* Middle Details */}
                  <View style={styles.chatDetails}>
                    <Text style={[styles.chatName, { color: theme.text }]} numberOfLines={1}>
                      {displayName}
                    </Text>
                    {conv.isBlocked && (
                      <Text style={{ color: theme.error, fontSize: 11 }}>Blocked</Text>
                    )}
                    <View style={styles.messageRow}>
                      {!conv.isSelf && renderCheckmarks(conv.lastMessage?.status)}
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
                    <Text
                      style={[
                        styles.timeText,
                        {
                          color:
                            conv.unreadCount && conv.unreadCount > 0
                              ? theme.primary
                              : theme.textSecondary,
                        },
                      ]}
                    >
                      {timeString}
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                      {conv.mutedUntil && <Text style={{ fontSize: 12, color: theme.textSecondary }}>🔕</Text>}
                      {conv.isPinned && <Text style={{ fontSize: 12, color: theme.textSecondary }}>📌</Text>}
                    </View>
                    {Boolean(conv.unreadCount && conv.unreadCount > 0) && (
                      <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
                        <Text style={styles.unreadBadgeText}>
                          {conv.unreadCount! > 99 ? '99+' : conv.unreadCount}
                        </Text>
                      </View>
                    )}
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
          {hasNextPage && !searchQuery && (
            <TouchableOpacity style={{ padding: 16, alignItems: 'center' }} onPress={() => fetchNextPage()} disabled={isFetchingNextPage}>
              <Text style={{ color: theme.primary, fontWeight: '600' }}>{isFetchingNextPage ? 'Loading…' : 'Load more chats'}</Text>
            </TouchableOpacity>
          )}
          {messageHits.length > 0 && (
            <View>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Messages</Text>
              {messageHits.map((hit) => {
                const peer = hit.isMine ? hit.receiverUserOrganizationId : hit.senderUserOrganizationId;
                const conv = conversations.find((c) => c.userOrganizationId === peer);
                return (
                  <TouchableOpacity
                    key={hit.messageId}
                    style={[styles.chatItem, { borderBottomColor: theme.border }]}
                    onPress={() => conv && handleChatPress(conv)}
                  >
                    <View style={styles.chatDetails}>
                      <Text style={[styles.chatName, { color: theme.text }]} numberOfLines={1}>
                        {conv?.isSelf ? SELF_CHAT_NAME : conv?.name || 'Chat'}
                      </Text>
                      <Text style={[styles.lastMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                        {hit.isMine ? 'You: ' : ''}{hit.message}
                      </Text>
                    </View>
                    <Text style={[styles.timeText, { color: theme.textSecondary }]}>{formatConversationTime(hit.sendTime)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  archivedRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
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
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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

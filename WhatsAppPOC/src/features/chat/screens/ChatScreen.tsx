import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../core/theme';
import { getPersonalChatHistory, LastMessage } from '../api/chatApi';
import { useSendPersonalMessageMutation } from '../api/chatQueries';

export interface ChatRecipient {
  userOrganizationId: string;
  name: string;
  mobileNo?: string;
  about?: string | null;
  profilePhoto?: string | null;
}

export interface ChatMessage {
  id: string;
  chatId?: string;
  message: string;
  senderUserOrganizationId?: string;
  receiverUserOrganizationId?: string;
  status: 'SENDING' | 'SENT' | 'DELIVERED' | 'READ';
  sendTime: string;
  isMine: boolean;
}

interface ChatScreenProps {
  apiBaseUrl: string;
  accessToken: string;
  recipient: ChatRecipient;
  initialLastMessage?: LastMessage | null;
  onBack: () => void;
  onMessageSent?: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  apiBaseUrl,
  accessToken,
  recipient,
  initialLastMessage,
  onBack,
  onMessageSent,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'android' ? Math.max(insets.top, StatusBar.currentHeight || 0) : insets.top;
  const bottomInset = insets.bottom;

  const [inputMessage, setInputMessage] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [paginationLimit, setPaginationLimit] = useState<number>(30);
  const [sendError, setSendError] = useState<string | null>(null);

  // TanStack Query Mutation for sending message
  const sendMessageMutation = useSendPersonalMessageMutation();
  const isSending = sendMessageMutation.isPending;

  // Initialize messages list
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialLastMessage && initialLastMessage.message) {
      return [
        {
          id: initialLastMessage.chatId || 'init-1',
          chatId: initialLastMessage.chatId,
          message: initialLastMessage.message,
          senderUserOrganizationId: initialLastMessage.senderUserOrganizationId,
          receiverUserOrganizationId: initialLastMessage.receiverUserOrganizationId,
          status: (initialLastMessage.status as any) || 'SENT',
          sendTime: initialLastMessage.sendTime || new Date().toISOString(),
          isMine: initialLastMessage.receiverUserOrganizationId === recipient.userOrganizationId,
        },
      ];
    }
    return [];
  });

  const flatListRef = useRef<FlatList>(null);

  // Fetch full chat history for this specific userOrganizationId
  useEffect(() => {
    if (!apiBaseUrl || !accessToken || !recipient.userOrganizationId) return;

    let isMounted = true;
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const result = await getPersonalChatHistory(
          apiBaseUrl,
          accessToken,
          recipient.userOrganizationId,
          null,
          paginationLimit
        );

        if (isMounted && result) {
          const mappedMessages: ChatMessage[] = (result.messages || []).map(m => ({
            id: m.messageId,
            chatId: m.messageId,
            message: m.message,
            senderUserOrganizationId: m.senderUserOrganizationId,
            receiverUserOrganizationId: m.receiverUserOrganizationId,
            status: (m.status as any) || 'SENT',
            sendTime: m.sendTime,
            isMine: m.isMine,
          }));

          // Sort messages chronologically by sendTime
          mappedMessages.sort(
            (a, b) => new Date(a.sendTime).getTime() - new Date(b.sendTime).getTime()
          );

          setMessages(mappedMessages);
          setHasMore(result.pagination?.hasMore ?? (!!result.pagination?.nextCursor));
          setNextCursor(result.pagination?.nextCursor ?? null);
          if (result.pagination?.limit) {
            setPaginationLimit(result.pagination.limit);
          }
        }
      } catch (err: any) {
        console.warn('Could not fetch personal chat history:', err);
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, accessToken, recipient.userOrganizationId]);

  // Load older messages using pagination beforeChatId when reaching the top
  const loadOlderMessages = async () => {
    if (isLoadingMore || isLoadingHistory || !nextCursor || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const result = await getPersonalChatHistory(
        apiBaseUrl,
        accessToken,
        recipient.userOrganizationId,
        nextCursor,
        paginationLimit
      );

      if (result && result.messages && result.messages.length > 0) {
        const olderMapped: ChatMessage[] = result.messages.map(m => ({
          id: m.messageId,
          chatId: m.messageId,
          message: m.message,
          senderUserOrganizationId: m.senderUserOrganizationId,
          receiverUserOrganizationId: m.receiverUserOrganizationId,
          status: (m.status as any) || 'SENT',
          sendTime: m.sendTime,
          isMine: m.isMine,
        }));

        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newUnique = olderMapped.filter(m => !existingIds.has(m.id));
          const combined = [...newUnique, ...prev];
          combined.sort(
            (a, b) => new Date(a.sendTime).getTime() - new Date(b.sendTime).getTime()
          );
          return combined;
        });
      }

      setHasMore(result.pagination?.hasMore ?? (!!result.pagination?.nextCursor));
      setNextCursor(result.pagination?.nextCursor ?? null);
      if (result.pagination?.limit) {
        setPaginationLimit(result.pagination.limit);
      }
    } catch (err: any) {
      console.warn('Could not load older messages:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleScroll = (event: any) => {
    const { contentOffset } = event.nativeEvent;
    if (contentOffset.y <= 30 && hasMore && nextCursor && !isLoadingMore && !isLoadingHistory) {
      loadOlderMessages();
    }
  };

  const isInitialLoadRef = useRef(true);

  // Scroll to bottom on initial history load
  useEffect(() => {
    if (isInitialLoadRef.current && messages.length > 0) {
      isInitialLoadRef.current = false;
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [messages.length]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    return () => {
      showSub.remove();
    };
  }, []);

  const formatMessageTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleSendMessage = async () => {
    const text = inputMessage.trim();
    if (!text || isSending) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      message: text,
      receiverUserOrganizationId: recipient.userOrganizationId,
      status: 'SENDING',
      sendTime: new Date().toISOString(),
      isMine: true,
    };

    // Add optimistic message and clear input
    setMessages(prev => [...prev, optimisticMessage]);
    setInputMessage('');
    setSendError(null);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const sentData = await sendMessageMutation.mutateAsync({
        baseUrl: apiBaseUrl,
        accessToken,
        receiverUserOrganizationId: recipient.userOrganizationId,
        message: text,
      });

      // Update message with server confirmation
      setMessages(prev =>
        prev.map(m =>
          m.id === tempId
            ? {
                ...m,
                id: sentData.chatId || tempId,
                chatId: sentData.chatId,
                status: (sentData.status as any) || 'SENT',
                sendTime: sentData.sendTime || m.sendTime,
                senderUserOrganizationId: sentData.senderUserOrganizationId,
              }
            : m
        )
      );

      onMessageSent?.();
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setSendError(err.message || 'Failed to send message');
      // Update status to indicate failed
      setMessages(prev =>
        prev.map(m =>
          m.id === tempId
            ? {
                ...m,
                status: 'SENDING',
              }
            : m
        )
      );
    }
  };

  const renderStatusIcon = (status: ChatMessage['status']) => {
    switch (status) {
      case 'SENDING':
        return <ActivityIndicator size={10} color={theme.placeholder} style={{ marginLeft: 4 }} />;
      case 'SENT':
        return <Text style={styles.statusCheck}>✓</Text>;
      case 'DELIVERED':
        return <Text style={styles.statusCheck}>✓✓</Text>;
      case 'READ':
        return <Text style={[styles.statusCheck, { color: '#53BDEB' }]}>✓✓</Text>;
      default:
        return <Text style={styles.statusCheck}>✓</Text>;
    }
  };

  const avatarLetter = recipient.name ? recipient.name.charAt(0).toUpperCase() : '?';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0B141A' : '#EFEAE2' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Custom Header with Safe Area Inset */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
            paddingTop: Platform.OS === 'android' ? Math.max(topInset - insets.top, 0) + 10 : 10,
          },
        ]}
      >
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.backArrow, { color: theme.text }]}>←</Text>
        </TouchableOpacity>

        {/* Recipient Avatar */}
        <View style={[styles.headerAvatar, { backgroundColor: theme.primary }]}>
          <Text style={styles.headerAvatarText}>{avatarLetter}</Text>
        </View>

        {/* Recipient Info */}
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: theme.text }]} numberOfLines={1}>
            {recipient.name}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {recipient.about || recipient.mobileNo || 'online'}
          </Text>
        </View>

        {/* Action Icons */}
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 18 }}>📹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 18 }}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.actionMoreText, { color: theme.text }]}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >

        {/* Error Notification */}
        {sendError && (
          <View style={[styles.errorBanner, { backgroundColor: theme.surface }]}>
            <Text style={[styles.errorBannerText, { color: theme.error }]}>⚠️ {sendError}</Text>
          </View>
        )}

        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.messagesContainer}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={100}
          ListHeaderComponent={
            isLoadingHistory || isLoadingMore ? (
              <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 10 }} />
            ) : hasMore && nextCursor ? (
              <TouchableOpacity
                onPress={loadOlderMessages}
                style={{ padding: 8, alignItems: 'center', marginBottom: 8 }}
              >
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>
                  ↑ Load earlier messages
                </Text>
              </TouchableOpacity>
            ) : undefined
          }
          ListEmptyComponent={
            isLoadingHistory ? undefined : (
              <View style={styles.emptyContainer}>
                <View style={[styles.encryptionNotice, { backgroundColor: isDark ? '#182229' : '#FFEECD' }]}>
                  <Text style={[styles.encryptionText, { color: isDark ? '#8696A0' : '#54656F' }]}>
                    🔒 Messages are end-to-end encrypted. No one outside of this chat can read them.
                  </Text>
                </View>
                <Text style={[styles.startConversationText, { color: theme.textSecondary }]}>
                  Say "Hi" to {recipient.name} 👋
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const isMine = item.isMine;
            return (
              <View
                style={[
                  styles.messageBubbleContainer,
                  isMine ? styles.myMessageContainer : styles.theirMessageContainer,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    isMine
                      ? [styles.myBubble, { backgroundColor: isDark ? '#005C4B' : '#D9FDD3' }]
                      : [styles.theirBubble, { backgroundColor: isDark ? '#202C33' : '#FFFFFF' }],
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      { color: isDark ? '#E9EDEF' : '#111B21' },
                    ]}
                  >
                    {item.message}
                  </Text>
                  <View style={styles.messageFooter}>
                    <Text
                      style={[
                        styles.messageTime,
                        { color: isDark ? '#8696A0' : '#667781' },
                      ]}
                    >
                      {formatMessageTime(item.sendTime)}
                    </Text>
                    {isMine && renderStatusIcon(item.status)}
                  </View>
                </View>
              </View>
            );
          }}
        />

        {/* Input Bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
            },
          ]}
        >
          <TouchableOpacity style={styles.inputIconBtn}>
            <Text style={{ fontSize: 20 }}>😊</Text>
          </TouchableOpacity>

          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: isDark ? '#2A3942' : '#F0F2F5',
                color: theme.text,
              },
            ]}
            placeholder="Message"
            placeholderTextColor={theme.placeholder}
            value={inputMessage}
            onChangeText={setInputMessage}
            multiline
            maxLength={1000}
          />

          <TouchableOpacity style={styles.inputIconBtn}>
            <Text style={{ fontSize: 20 }}>📎</Text>
          </TouchableOpacity>

          {/* Send Button */}
          {inputMessage.trim().length > 0 ? (
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: theme.primary }]}
              onPress={handleSendMessage}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sendIcon}>➤</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.micButton, { backgroundColor: theme.primary }]}>
              <Text style={{ fontSize: 18, color: '#FFFFFF' }}>🎤</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingRight: 8,
  },
  backArrow: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  actionBtn: {
    padding: 4,
  },
  actionMoreText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  errorBanner: {
    padding: 8,
    alignItems: 'center',
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  messagesContainer: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  encryptionNotice: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    maxWidth: '85%',
    marginBottom: 20,
  },
  encryptionText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  startConversationText: {
    fontSize: 14,
    fontWeight: '500',
  },
  messageBubbleContainer: {
    marginVertical: 4,
    flexDirection: 'row',
  },
  myMessageContainer: {
    justifyContent: 'flex-end',
  },
  theirMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  myBubble: {
    borderTopRightRadius: 2,
  },
  theirBubble: {
    borderTopLeftRadius: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 3,
  },
  messageTime: {
    fontSize: 11,
  },
  statusCheck: {
    fontSize: 11,
    marginLeft: 3,
    color: '#8696A0',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  inputIconBtn: {
    padding: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 15,
    maxHeight: 100,
    marginHorizontal: 4,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  micButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});

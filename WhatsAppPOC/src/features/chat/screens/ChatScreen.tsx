import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Share,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../core/theme';
import {
  ApiChatMessage,
  blockUser,
  deleteMessage,
  editMessage,
  forwardMessage,
  getPersonalChatHistory,
  getPinnedMessages,
  LastMessage,
  MuteOption,
  ReportReason,
  reportUser,
  searchMessages,
  setPinned,
  setReaction,
  setStarred,
  unblockUser,
  updateConversation,
} from '../api/chatApi';
import { connectSocket, socket } from '../../../services/socket';
import { MessageBubble } from '../components/MessageBubble';
import { MessageAction, MessageActionSheet } from '../components/MessageActionSheet';
import { ForwardPicker } from '../components/ForwardPicker';
import { ContactProfileModal } from '../components/ContactProfileModal';
import { chooseAttachment, PickedAttachment } from '../../../components/media/attachmentPicker';
import { VoiceRecorder } from '../../../components/media/VoiceRecorder';
import { Avatar } from '../../../components/media/Avatar';
import { startCall, CallType } from '../../calls/state/callStore';
import { LocalFile, MediaKind, uploadFile } from '../../../services/media/mediaService';
import {
  ChatMessage,
  fromServer,
  mergeMessages,
  newClientMessageId,
  peerOf,
  removeMessage,
  updateMessage,
  withDateSeparators,
} from '../utils/messageList';

export type { ChatMessage } from '../utils/messageList';

export interface ChatRecipient {
  userOrganizationId: string;
  name: string;
  mobileNo?: string;
  about?: string | null;
  profilePhoto?: string | null;
  profilePhotoMediaId?: string | null;
  lastSeen?: string | null;
  isSelf?: boolean;
  isBlocked?: boolean;
  mutedUntil?: string | null;
}

export const formatLastSeen = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const timeFormatted = date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return `last seen today at ${timeFormatted}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return `last seen yesterday at ${timeFormatted}`;
    }

    const dateFormatted = date.toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
    });

    return `last seen ${dateFormatted} at ${timeFormatted}`;
  } catch {
    return '';
  }
};

interface ChatScreenProps {
  apiBaseUrl: string;
  accessToken: string;
  recipient: ChatRecipient;
  initialLastMessage?: LastMessage | null;
  onBack: () => void;
  onMessageSent?: () => void;
}

// A send with no acknowledgement in this time is shown as failed, with retry.
const SEND_TIMEOUT_MS = 15000;
const REPORT_REASONS: { reason: ReportReason; label: string }[] = [
  { reason: 'SPAM', label: 'Spam' },
  { reason: 'HARASSMENT', label: 'Harassment' },
  { reason: 'SCAM', label: 'Scam or fraud' },
  { reason: 'INAPPROPRIATE', label: 'Inappropriate content' },
  { reason: 'OTHER', label: 'Something else' },
];

const TypingDots: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: -5,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 520 - delay)),
        ])
      );
    };

    const anim1 = createDotAnimation(dot1, 0);
    const anim2 = createDotAnimation(dot2, 160);
    const anim3 = createDotAnimation(dot3, 320);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dotColor = isDark ? '#8696A0' : '#667781';

  return (
    <View style={styles.typingDotsContainer}>
      <Animated.View
        style={[
          styles.typingDot,
          { backgroundColor: dotColor, transform: [{ translateY: dot1 }] },
        ]}
      />
      <Animated.View
        style={[
          styles.typingDot,
          { backgroundColor: dotColor, transform: [{ translateY: dot2 }] },
        ]}
      />
      <Animated.View
        style={[
          styles.typingDot,
          { backgroundColor: dotColor, transform: [{ translateY: dot3 }] },
        ]}
      />
    </View>
  );
};

export const ChatScreen: React.FC<ChatScreenProps> = ({
  apiBaseUrl,
  accessToken,
  recipient,
  onBack,
  onMessageSent,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isSelf = Boolean(recipient.isSelf);
  const peerId = String(recipient.userOrganizationId);
  const topInset = Platform.OS === 'android' ? Math.max(insets.top, StatusBar.currentHeight || 0) : insets.top;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isRecipientOnline, setIsRecipientOnline] = useState(false);
  const [recipientLastSeen, setRecipientLastSeen] = useState<string | null>(recipient.lastSeen || null);
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [actionTarget, setActionTarget] = useState<ChatMessage | null>(null);
  const [forwardSource, setForwardSource] = useState<ChatMessage | null>(null);
  const [pinned, setPinnedList] = useState<ApiChatMessage[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(Boolean(recipient.isBlocked));
  const [mutedUntil, setMutedUntil] = useState<string | null>(recipient.mutedUntil ?? null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ApiChatMessage[] | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    const up = () => setIsConnected(true);
    const down = () => setIsConnected(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    socket.on('connect_error', down);
    return () => {
      socket.off('connect', up);
      socket.off('disconnect', down);
      socket.off('connect_error', down);
    };
  }, []);

  const flatListRef = useRef<FlatList>(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recipientTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const rows = useMemo(() => withDateSeparators(messages), [messages]);
  const belongsHere = useCallback((message: ApiChatMessage) => peerOf(message) === peerId, [peerId]);

  const scrollToEnd = (animated = true) =>
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 100);

  // ---------------------------------------------------------------
  // History, catch-up and pinned messages
  // ---------------------------------------------------------------

  const acknowledge = useCallback(
    (incoming: ApiChatMessage[]) => {
      if (isSelf) return;
      const undelivered = incoming.filter((m) => !m.isMine && m.status === 'SENT').map((m) => m.messageId);
      if (undelivered.length > 0) {
        socket.emit('message:delivered', { messageIds: undelivered });
      }
      if (incoming.some((m) => !m.isMine)) {
        socket.emit('message:read', { otherUserOrganizationId: peerId });
      }
    },
    [isSelf, peerId],
  );

  const loadLatest = useCallback(async () => {
    const result = await getPersonalChatHistory(apiBaseUrl, accessToken, peerId, null, 30);
    setMessages((current) => mergeMessages(current, result.messages.map(fromServer)));
    setHasMore(Boolean(result.pagination?.hasMore));
    setNextCursor(result.pagination?.nextCursor ?? null);
    acknowledge(result.messages);
    return result;
  }, [apiBaseUrl, accessToken, peerId, acknowledge]);

  const loadPinned = useCallback(() => {
    getPinnedMessages(accessToken, peerId).then(setPinnedList).catch(() => undefined);
  }, [accessToken, peerId]);

  useEffect(() => {
    if (!accessToken || !peerId) return;
    let active = true;
    setIsLoadingHistory(true);
    loadLatest()
      .then(() => active && scrollToEnd(false))
      .catch((err) => active && setSendError(err?.message || 'Could not load messages'))
      .finally(() => active && setIsLoadingHistory(false));
    loadPinned();
    return () => {
      active = false;
    };
  }, [accessToken, peerId, loadLatest, loadPinned]);

  const loadOlderMessages = async () => {
    if (isLoadingMore || isLoadingHistory || !nextCursor || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const result = await getPersonalChatHistory(apiBaseUrl, accessToken, peerId, nextCursor, 30);
      setMessages((current) => mergeMessages(current, result.messages.map(fromServer)));
      setHasMore(Boolean(result.pagination?.hasMore));
      setNextCursor(result.pagination?.nextCursor ?? null);
    } catch (err: any) {
      setSendError(err?.message || 'Could not load earlier messages');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // ---------------------------------------------------------------
  // Sending, with an ID so retries are safe
  // ---------------------------------------------------------------

  const markFailed = useCallback((clientMessageId: string) => {
    sendTimers.current.delete(clientMessageId);
    setMessages((current) =>
      updateMessage(current, (m) => m.clientMessageId === clientMessageId && m.status === 'SENDING', () => ({ status: 'FAILED' })),
    );
  }, []);

  const emitSend = useCallback(
    (message: ChatMessage) => {
      const clientMessageId = message.clientMessageId!;
      clearTimeout(sendTimers.current.get(clientMessageId));
      sendTimers.current.set(clientMessageId, setTimeout(() => markFailed(clientMessageId), SEND_TIMEOUT_MS));
      socket.emit('message:send', {
        receiverUserOrganizationId: peerId,
        message: message.message ?? '',
        clientMessageId,
        replyToMessageId: message.replyTo?.messageId ?? null,
        mediaId: message.media?.mediaId || null,
      });
    },
    [peerId, markFailed],
  );

  // Uploads an attachment, then sends it. Failure at either step can be retried.
  const uploadThenSend = useCallback(
    async (message: ChatMessage) => {
      try {
        const media = await uploadFile(message.localFile!, message.media!.kind as MediaKind, (fraction) =>
          setMessages((current) => updateMessage(current, (m) => m.localId === message.localId, () => ({ uploadProgress: fraction }))),
        );
        const uploaded = { ...message, media, uploadProgress: undefined };
        setMessages((current) => updateMessage(current, (m) => m.localId === message.localId, () => uploaded));
        if (socket.connected) emitSend(uploaded);
      } catch (err: any) {
        setMessages((current) => updateMessage(current, (m) => m.localId === message.localId, () => ({ status: 'FAILED' })));
        setSendError(err?.message || 'Upload failed');
      }
    },
    [emitSend],
  );

  const retry = (message: ChatMessage) => {
    setMessages((current) => updateMessage(current, (m) => m.localId === message.localId, () => ({ status: 'SENDING' })));
    if (message.uploadProgress !== undefined && message.localFile) {
      uploadThenSend({ ...message, status: 'SENDING' });
    } else if (socket.connected) {
      emitSend({ ...message, status: 'SENDING' });
    }
  };

  const sendAttachment = (picked: PickedAttachment | { file: LocalFile; kind: MediaKind }) => {
    const clientMessageId = newClientMessageId();
    const optimistic: ChatMessage = {
      localId: `local-${clientMessageId}`,
      clientMessageId,
      senderUserOrganizationId: '',
      receiverUserOrganizationId: peerId,
      message: '',
      messageType: picked.kind,
      sendTime: new Date().toISOString(),
      status: 'SENDING',
      isMine: true,
      uploadProgress: 0,
      localFile: picked.file,
      media: {
        mediaId: '',
        kind: picked.kind,
        mimeType: picked.file.type,
        fileName: picked.file.name,
        size: picked.file.size,
        width: null,
        height: null,
        durationMs: picked.file.durationMs ?? null,
        hasThumbnail: false,
      },
    };
    setMessages((current) => mergeMessages(current, [optimistic]));
    scrollToEnd();
    uploadThenSend(optimistic);
  };

  const attach = async () => {
    try {
      const picked = await chooseAttachment();
      if (picked) sendAttachment(picked);
    } catch (err: any) {
      setSendError(err?.message || 'Could not attach the file');
    }
  };

  useEffect(() => {
    const timers = sendTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  // ---------------------------------------------------------------
  // Live events
  // ---------------------------------------------------------------

  useEffect(() => {
    if (accessToken) {
      connectSocket(accessToken);
    }

    const onNew = (message: ApiChatMessage) => {
      if (!belongsHere(message)) return;
      setMessages((current) => mergeMessages(current, [fromServer(message)]));
      acknowledge([message]);
      scrollToEnd();
    };

    const onSent = (message: ApiChatMessage) => {
      if (!belongsHere(message)) return;
      if (message.clientMessageId) {
        clearTimeout(sendTimers.current.get(message.clientMessageId));
        sendTimers.current.delete(message.clientMessageId);
      }
      setMessages((current) => mergeMessages(current, [fromServer(message)]));
      onMessageSent?.();
    };

    const onError = (error: { clientMessageId?: string | null; message?: string }) => {
      if (error?.clientMessageId) {
        markFailed(error.clientMessageId);
      }
      setSendError(error?.message || 'Message not sent');
    };

    const onDelivered = (data: { messageId: string; receiveTime?: string }) =>
      setMessages((current) =>
        updateMessage(current, (m) => m.messageId === data.messageId && m.status === 'SENT', () => ({
          status: 'DELIVERED',
          receiveTime: data.receiveTime,
        })),
      );

    const onRead = (data: { messageIds?: string[]; readerUserOrganizationId?: string; readTime?: string }) => {
      if (data?.readerUserOrganizationId !== peerId) return;
      const ids = new Set(data.messageIds ?? []);
      setMessages((current) =>
        updateMessage(current, (m) => Boolean(m.messageId && ids.has(m.messageId)), () => ({ status: 'SEEN', readTime: data.readTime })),
      );
    };

    const onUpdated = (data: { reason: string; message: ApiChatMessage }) => {
      if (!data?.message || !belongsHere(data.message)) return;
      setMessages((current) => mergeMessages(current, [fromServer(data.message)]));
      if (data.reason === 'pinned' || data.reason === 'unpinned' || data.reason === 'deleted') {
        loadPinned();
      }
    };

    const onRemoved = (data: { messageId: string }) => setMessages((current) => removeMessage(current, data.messageId));

    const onStarred = (data: { messageId: string; isStarred: boolean }) =>
      setMessages((current) => updateMessage(current, (m) => m.messageId === data.messageId, () => ({ isStarred: data.isStarred })));

    // After reconnecting: catch up on what arrived offline, then send what was queued.
    const onReconnect = () => {
      loadLatest().catch(() => undefined);
      messagesRef.current
        .filter((m) => m.status === 'SENDING' && m.clientMessageId && m.uploadProgress === undefined)
        .forEach(emitSend);
    };

    socket.on('message:new', onNew);
    socket.on('message:sent', onSent);
    socket.on('message:error', onError);
    socket.on('message:delivered', onDelivered);
    socket.on('message:read', onRead);
    socket.on('message:updated', onUpdated);
    socket.on('message:removed', onRemoved);
    socket.on('message:starred', onStarred);
    socket.on('connect', onReconnect);

    return () => {
      socket.off('message:new', onNew);
      socket.off('message:sent', onSent);
      socket.off('message:error', onError);
      socket.off('message:delivered', onDelivered);
      socket.off('message:read', onRead);
      socket.off('message:updated', onUpdated);
      socket.off('message:removed', onRemoved);
      socket.off('message:starred', onStarred);
      socket.off('connect', onReconnect);
    };
  }, [accessToken, peerId, belongsHere, acknowledge, loadLatest, loadPinned, markFailed, emitSend, onMessageSent]);

  // Presence: not shown for a self-chat.
  useEffect(() => {
    if (isSelf || !peerId) return;

    const queryPresence = () => socket.emit('presence:get', { targetUserOrganizationId: peerId });
    const onPresence = (data: any) => {
      if (String(data?.userOrganizationId) !== peerId) return;
      setIsRecipientOnline(Boolean(data.isOnline));
      if (data.lastSeen !== undefined) setRecipientLastSeen(data.lastSeen);
    };

    queryPresence();
    socket.on('connect', queryPresence);
    socket.on('presence:status', onPresence);
    socket.on('presence:update', onPresence);
    return () => {
      socket.off('connect', queryPresence);
      socket.off('presence:status', onPresence);
      socket.off('presence:update', onPresence);
    };
  }, [peerId, isSelf]);

  // Tells the server this chat is open, so it skips the push notification.
  useEffect(() => {
    if (!peerId) return;
    socket.emit('chat:active', { activeWithUserOrganizationId: peerId });
    return () => {
      socket.emit('chat:inactive');
    };
  }, [peerId]);

  useEffect(() => {
    if (isSelf) return;

    const onStart = (data: any) => {
      if (String(data?.senderUserOrganizationId) !== peerId) return;
      setIsRecipientTyping(true);
      if (recipientTypingTimeoutRef.current) clearTimeout(recipientTypingTimeoutRef.current);
      recipientTypingTimeoutRef.current = setTimeout(() => setIsRecipientTyping(false), 3500);
    };
    const onStop = (data: any) => {
      if (String(data?.senderUserOrganizationId) !== peerId) return;
      if (recipientTypingTimeoutRef.current) clearTimeout(recipientTypingTimeoutRef.current);
      setIsRecipientTyping(false);
    };

    socket.on('typing:start', onStart);
    socket.on('typing:stop', onStop);
    return () => {
      if (recipientTypingTimeoutRef.current) clearTimeout(recipientTypingTimeoutRef.current);
      socket.off('typing:start', onStart);
      socket.off('typing:stop', onStop);
    };
  }, [peerId, isSelf]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current && socket.connected) {
      isTypingRef.current = false;
      socket.emit('typing:stop', { receiverUserOrganizationId: peerId });
    }
  }, [peerId]);

  useEffect(() => stopTyping, [stopTyping]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => scrollToEnd());
    return () => show.remove();
  }, []);

  useEffect(() => {
    if (isRecipientTyping) scrollToEnd();
  }, [isRecipientTyping]);

  const handleTypingChange = (text: string) => {
    setInputMessage(text);
    if (isSelf || editing) return;

    if (text.trim().length > 0) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        socket.emit('typing:start', { receiverUserOrganizationId: peerId });
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(stopTyping, 2000);
    } else {
      stopTyping();
    }
  };

  const handleSendMessage = async () => {
    const text = inputMessage.trim();
    if (!text) return;
    stopTyping();
    setSendError(null);

    if (editing?.messageId) {
      const target = editing;
      setEditing(null);
      setInputMessage('');
      try {
        const updated = await editMessage(accessToken, target.messageId!, text);
        setMessages((current) => mergeMessages(current, [fromServer(updated)]));
      } catch (err: any) {
        setSendError(err?.message || 'Could not edit the message');
      }
      return;
    }

    const clientMessageId = newClientMessageId();
    const optimistic: ChatMessage = {
      localId: `local-${clientMessageId}`,
      clientMessageId,
      senderUserOrganizationId: '',
      receiverUserOrganizationId: peerId,
      message: text,
      sendTime: new Date().toISOString(),
      status: 'SENDING',
      isMine: true,
      replyTo: replyTo?.messageId
        ? {
            messageId: replyTo.messageId,
            senderUserOrganizationId: replyTo.senderUserOrganizationId,
            message: replyTo.message,
            isDeleted: Boolean(replyTo.isDeleted),
          }
        : null,
    };

    setMessages((current) => mergeMessages(current, [optimistic]));
    setInputMessage('');
    setReplyTo(null);
    scrollToEnd();

    // Offline: it stays "sending" and goes out when the socket reconnects, or
    // shows "Not sent. Tap to retry" if the connection does not come back in time.
    if (socket.connected) {
      emitSend(optimistic);
    } else {
      sendTimers.current.set(clientMessageId, setTimeout(() => markFailed(clientMessageId), SEND_TIMEOUT_MS));
    }
  };

  // ---------------------------------------------------------------
  // Message actions
  // ---------------------------------------------------------------

  const myIdFor = (message: ChatMessage) =>
    message.isMine ? message.senderUserOrganizationId : message.receiverUserOrganizationId;

  const myReactionTo = (message: ChatMessage | null) =>
    message ? message.reactions?.find((r) => r.userOrganizationId === myIdFor(message))?.emoji ?? null : null;

  const attempt = async (task: () => Promise<unknown>, failure: string) => {
    try {
      await task();
    } catch (err: any) {
      Alert.alert(failure, err?.message || 'Please try again.');
    }
  };

  const chooseReport = (onPick: (reason: ReportReason) => void) =>
    Alert.alert('Report', 'Why are you reporting this?', [
      ...REPORT_REASONS.map(({ reason, label }) => ({ text: label, onPress: () => onPick(reason) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const submitReport = (reason: ReportReason, messageId?: string) =>
    Alert.alert('Also block this contact?', undefined, [
      { text: 'Report only', onPress: () => attempt(() => reportUser(accessToken, { userOrganizationId: peerId, reason, messageId }), 'Report failed') },
      {
        text: 'Report and block',
        style: 'destructive',
        onPress: () =>
          attempt(async () => {
            await reportUser(accessToken, { userOrganizationId: peerId, reason, messageId, block: true });
            setIsBlocked(true);
          }, 'Report failed'),
      },
    ]);

  const handleAction = (message: ChatMessage, action: MessageAction) => {
    setActionTarget(null);
    const id = message.messageId!;

    switch (action) {
      case 'reply':
        setEditing(null);
        setReplyTo(message);
        break;
      case 'forward':
        setForwardSource(message);
        break;
      case 'star':
      case 'unstar': {
        const starred = action === 'star';
        setMessages((current) => updateMessage(current, (m) => m.messageId === id, () => ({ isStarred: starred })));
        attempt(() => setStarred(accessToken, id, starred), 'Could not update star');
        break;
      }
      case 'pin':
      case 'unpin':
        attempt(() => setPinned(accessToken, id, action === 'pin'), 'Could not update pin');
        break;
      case 'edit':
        setReplyTo(null);
        setEditing(message);
        setInputMessage(message.message ?? '');
        break;
      case 'deleteForMe':
        Alert.alert('Delete for me?', 'The message is removed from your devices only.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () =>
              attempt(async () => {
                await deleteMessage(accessToken, id, 'me');
                setMessages((current) => removeMessage(current, id));
              }, 'Could not delete'),
          },
        ]);
        break;
      case 'deleteForEveryone':
        Alert.alert('Delete for everyone?', `${recipient.name} will see "This message was deleted".`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete for everyone', style: 'destructive', onPress: () => attempt(() => deleteMessage(accessToken, id, 'everyone'), 'Could not delete') },
        ]);
        break;
      case 'report':
        chooseReport((reason) => submitReport(reason, id));
        break;
    }
  };

  const handleReact = (message: ChatMessage, emoji: string | null) => {
    setActionTarget(null);
    attempt(() => setReaction(accessToken, message.messageId!, emoji), 'Could not react');
  };

  const jumpTo = (messageId: string) => {
    const index = rows.findIndex((row) => row.type === 'message' && row.message.messageId === messageId);
    if (index === -1) {
      Alert.alert('Older message', 'Scroll up to load earlier messages to see it.');
      return;
    }
    setHighlightedId(messageId);
    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setTimeout(() => setHighlightedId(null), 1500);
  };

  // ---------------------------------------------------------------
  // Chat menu: search, mute, block, report
  // ---------------------------------------------------------------

  const setMute = (muted: MuteOption) =>
    attempt(async () => {
      const conversation = await updateConversation(accessToken, peerId, { muted });
      setMutedUntil(conversation.mutedUntil ?? null);
    }, 'Could not change notifications');

  const toggleBlock = () =>
    Alert.alert(
      isBlocked ? `Unblock ${recipient.name}?` : `Block ${recipient.name}?`,
      isBlocked ? undefined : 'Blocked contacts cannot message you, see your online status or see you typing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: () =>
            attempt(async () => {
              await (isBlocked ? unblockUser : blockUser)(accessToken, peerId);
              setIsBlocked(!isBlocked);
            }, 'Could not update block'),
        },
      ],
    );

  const openMenu = () => {
    const isMuted = Boolean(mutedUntil && new Date(mutedUntil).getTime() > Date.now());
    Alert.alert(recipient.name, undefined, [
      { text: 'Search', onPress: () => setIsSearching(true) },
      { text: 'Export chat', onPress: exportChat },
      ...(!isSelf
        ? [
            isMuted
              ? { text: 'Unmute notifications', onPress: () => setMute(false) }
              : {
                  text: 'Mute notifications',
                  onPress: () =>
                    Alert.alert('Mute notifications', undefined, [
                      { text: '8 hours', onPress: () => setMute('8h') },
                      { text: '1 week', onPress: () => setMute('1w') },
                      { text: 'Always', onPress: () => setMute('forever') },
                      { text: 'Cancel', style: 'cancel' as const },
                    ]),
                },
            { text: isBlocked ? 'Unblock' : 'Block', onPress: toggleBlock },
            { text: 'Report', onPress: () => chooseReport((reason) => submitReport(reason)) },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  // Exports this chat as plain text through the system share sheet.
  const exportChat = async () => {
    try {
      const all: ApiChatMessage[] = [];
      let cursor: string | null = null;
      do {
        const page = await getPersonalChatHistory(apiBaseUrl, accessToken, peerId, cursor, 50);
        all.unshift(...page.messages);
        cursor = page.pagination?.hasMore ? page.pagination.nextCursor ?? null : null;
      } while (cursor && all.length < 5000);

      const lines = all.map((m) => {
        const when = new Date(m.sendTime).toLocaleString();
        const who = m.isMine ? 'You' : recipient.name;
        const body = m.isDeleted ? '[deleted]' : m.message || (m.media ? `[${m.media.kind.toLowerCase()}: ${m.media.fileName}]` : '');
        return `[${when}] ${who}: ${body}`;
      });
      await Share.share({ title: `Chat with ${recipient.name}`, message: lines.join('\n') || 'No messages' });
    } catch (err: any) {
      Alert.alert('Could not export the chat', err?.message || 'Please try again.');
    }
  };

  const runSearch = async () => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const result = await searchMessages(accessToken, searchQuery.trim(), peerId);
      setSearchResults(result.messages);
    } catch (err: any) {
      setSendError(err?.message || 'Search failed');
    }
  };

  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults(null);
  };

  const topPinned = pinned[0];

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0B141A' : '#EFEAE2' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
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
        <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Back">
          <Text style={[styles.backArrow, { color: theme.text }]}>←</Text>
        </TouchableOpacity>

        {isSearching ? (
          <TextInput
            autoFocus
            style={[styles.searchInput, { color: theme.text, backgroundColor: isDark ? '#2A3942' : '#F0F2F5' }]}
            placeholder="Search this chat"
            placeholderTextColor={theme.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={runSearch}
            returnKeyType="search"
          />
        ) : (
          <>
            <TouchableOpacity style={styles.headerAvatar} onPress={() => setIsProfileOpen(true)} accessibilityLabel="Contact info">
              <Avatar name={recipient.name} mediaId={recipient.profilePhotoMediaId} size={38} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerInfo} onPress={() => setIsProfileOpen(true)}>
              <Text style={[styles.headerName, { color: theme.text }]} numberOfLines={1}>
                {recipient.name}
              </Text>
              <Text
                style={[styles.headerSubtitle, { color: isRecipientTyping || isRecipientOnline ? theme.primary : theme.textSecondary }]}
                numberOfLines={1}
              >
                {isSelf
                  ? 'Message yourself'
                  : isBlocked
                  ? 'Blocked'
                  : isRecipientTyping
                  ? 'typing...'
                  : isRecipientOnline
                  ? 'online'
                  : formatLastSeen(recipientLastSeen) || recipient.about || recipient.mobileNo || ''}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {!isSelf && !isBlocked && !isSearching && (
          <>
            {(['VIDEO', 'AUDIO'] as CallType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.actionBtn, { marginRight: 10 }]}
                onPress={() =>
                  startCall({ userOrganizationId: peerId, name: recipient.name }, type).catch((err) => Alert.alert('Could not call', err?.message))
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={type === 'VIDEO' ? 'Video call' : 'Voice call'}
              >
                <Text style={{ fontSize: 18 }}>{type === 'VIDEO' ? '📹' : '📞'}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={isSearching ? closeSearch : openMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={isSearching ? 'Close search' : 'Chat options'}
        >
          <Text style={[styles.actionMoreText, { color: theme.text }]}>{isSearching ? '✕' : '⋮'}</Text>
        </TouchableOpacity>
      </View>

      {/* Search results */}
      {isSearching && searchResults && (
        <View style={[styles.searchResults, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          {searchResults.length === 0 ? (
            <Text style={{ color: theme.textSecondary, padding: 12 }}>No messages found</Text>
          ) : (
            searchResults.slice(0, 20).map((result) => (
              <TouchableOpacity
                key={result.messageId}
                style={[styles.searchRow, { borderBottomColor: theme.border }]}
                onPress={() => {
                  closeSearch();
                  jumpTo(result.messageId);
                }}
              >
                <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                  {result.isMine ? 'You' : recipient.name} · {new Date(result.sendTime).toLocaleDateString()}
                </Text>
                <Text style={{ color: theme.text }} numberOfLines={2}>{result.message}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* Pinned banner */}
      {!isSearching && topPinned && (
        <TouchableOpacity
          style={[styles.pinnedBanner, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
          onPress={() => jumpTo(topPinned.messageId)}
        >
          <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
            📌 Pinned{pinned.length > 1 ? ` (${pinned.length})` : ''}
          </Text>
          <Text style={{ color: theme.text }} numberOfLines={1}>{topPinned.message}</Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        {!isConnected && (
          <View style={[styles.errorBanner, { backgroundColor: theme.surface }]}>
            <Text style={[styles.errorBannerText, { color: theme.textSecondary }]}>Connecting… messages will send when the connection is back.</Text>
          </View>
        )}
        {sendError && (
          <TouchableOpacity style={[styles.errorBanner, { backgroundColor: theme.surface }]} onPress={() => setSendError(null)}>
            <Text style={[styles.errorBannerText, { color: theme.error }]}>⚠️ {sendError}</Text>
          </TouchableOpacity>
        )}

        <FlatList
          ref={flatListRef}
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={styles.messagesContainer}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={100}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            setShowScrollDown(contentSize.height - contentOffset.y - layoutMeasurement.height > 300);
            if (contentOffset.y <= 30) loadOlderMessages();
          }}
          onScrollToIndexFailed={({ index }) =>
            setTimeout(() => flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }), 200)
          }
          ListHeaderComponent={
            isLoadingHistory || isLoadingMore ? (
              <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 10 }} />
            ) : hasMore && nextCursor ? (
              <TouchableOpacity onPress={loadOlderMessages} style={{ padding: 8, alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>↑ Load earlier messages</Text>
              </TouchableOpacity>
            ) : undefined
          }
          ListEmptyComponent={
            isLoadingHistory ? undefined : (
              <View style={styles.emptyContainer}>
                <View style={[styles.encryptionNotice, { backgroundColor: isDark ? '#182229' : '#FFEECD' }]}>
                  <Text style={[styles.encryptionText, { color: isDark ? '#8696A0' : '#54656F' }]}>
                    {isSelf
                      ? 'Keep notes, links and reminders here. Only you can see this chat.'
                      : "Messages are stored on your organization's server."}
                  </Text>
                </View>
                {!isSelf && (
                  <Text style={[styles.startConversationText, { color: theme.textSecondary }]}>Say "Hi" to {recipient.name} 👋</Text>
                )}
              </View>
            )
          }
          renderItem={({ item: row }) =>
            row.type === 'date' ? (
              <View style={styles.dateRow}>
                <Text style={[styles.dateChip, { backgroundColor: isDark ? '#182229' : '#FFFFFF', color: theme.textSecondary }]}>{row.label}</Text>
              </View>
            ) : (
              <MessageBubble
                message={row.message}
                isDark={isDark}
                isSelfChat={isSelf}
                peerName={recipient.name}
                isHighlighted={highlightedId !== null && row.message.messageId === highlightedId}
                onLongPress={setActionTarget}
                onRetry={retry}
                onPressReply={jumpTo}
              />
            )
          }
          ListFooterComponent={
            isRecipientTyping ? (
              <View style={[styles.messageBubbleContainer, styles.theirMessageContainer, { marginBottom: 8 }]}>
                <View style={[styles.messageBubble, styles.theirBubble, styles.typingBubble, { backgroundColor: isDark ? '#202C33' : '#FFFFFF' }]}>
                  <TypingDots isDark={isDark} />
                </View>
              </View>
            ) : undefined
          }
        />

        {showScrollDown && (
          <TouchableOpacity
            style={[styles.scrollDown, { backgroundColor: theme.surface }]}
            onPress={() => scrollToEnd()}
            accessibilityLabel="Scroll to latest message"
          >
            <Text style={{ color: theme.text, fontSize: 18 }}>⌄</Text>
          </TouchableOpacity>
        )}

        {/* Reply or edit preview */}
        {(replyTo || editing) && (
          <View style={[styles.composerContext, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
                {editing ? 'Edit message' : replyTo!.isMine ? 'Replying to yourself' : `Replying to ${recipient.name}`}
              </Text>
              <Text style={{ color: theme.textSecondary }} numberOfLines={1}>{(editing ?? replyTo)!.message}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (editing) setInputMessage('');
                setEditing(null);
                setReplyTo(null);
              }}
              accessibilityLabel="Cancel"
            >
              <Text style={{ color: theme.textSecondary, fontSize: 18, padding: 4 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {isBlocked ? (
          <TouchableOpacity style={[styles.inputBar, styles.blockedBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]} onPress={toggleBlock}>
            <Text style={{ color: theme.textSecondary }}>You blocked this contact. Tap to unblock.</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            {isRecording ? (
              <VoiceRecorder
                color={theme.text}
                background={isDark ? '#2A3942' : '#F0F2F5'}
                onCancel={() => setIsRecording(false)}
                onRecorded={(file) => {
                  setIsRecording(false);
                  sendAttachment({ file, kind: 'VOICE' });
                }}
              />
            ) : (
              <>
                {!editing && (
                  <TouchableOpacity style={styles.inputIconBtn} onPress={attach} accessibilityLabel="Attach a file">
                    <Text style={{ fontSize: 20 }}>📎</Text>
                  </TouchableOpacity>
                )}
                <TextInput
                  style={[styles.textInput, { backgroundColor: isDark ? '#2A3942' : '#F0F2F5', color: theme.text }]}
                  placeholder="Message"
                  placeholderTextColor={theme.placeholder}
                  value={inputMessage}
                  onChangeText={handleTypingChange}
                  multiline
                  maxLength={5000}
                />
              </>
            )}
            {!isRecording &&
              (inputMessage.trim() || editing ? (
                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: inputMessage.trim() ? theme.primary : theme.border }]}
                  onPress={handleSendMessage}
                  disabled={!inputMessage.trim()}
                  accessibilityLabel={editing ? 'Save edit' : 'Send'}
                >
                  <Text style={styles.sendIcon}>{editing ? '✓' : '➤'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.micButton, { backgroundColor: theme.primary }]}
                  onPress={() => setIsRecording(true)}
                  accessibilityLabel="Record a voice message"
                >
                  <Text style={{ fontSize: 18, color: '#FFFFFF' }}>🎤</Text>
                </TouchableOpacity>
              ))}
          </View>
        )}
      </KeyboardAvoidingView>

      <MessageActionSheet
        message={actionTarget}
        myReaction={myReactionTo(actionTarget)}
        isSelfChat={isSelf}
        onClose={() => setActionTarget(null)}
        onReact={handleReact}
        onAction={handleAction}
      />

      <ContactProfileModal
        visible={isProfileOpen}
        name={recipient.name}
        mobileNo={isSelf ? undefined : recipient.mobileNo}
        about={recipient.about}
        profilePhotoMediaId={recipient.profilePhotoMediaId}
        subtitle={isSelf ? 'Your notes' : undefined}
        onClose={() => setIsProfileOpen(false)}
        actions={[
          ...(!isSelf && !isBlocked
            ? [
                { label: '📞  Voice call', onPress: () => startCall({ userOrganizationId: peerId, name: recipient.name }, 'AUDIO').catch((e) => Alert.alert('Could not call', e?.message)) },
                { label: '📹  Video call', onPress: () => startCall({ userOrganizationId: peerId, name: recipient.name }, 'VIDEO').catch((e) => Alert.alert('Could not call', e?.message)) },
              ]
            : []),
          { label: 'Search in chat', onPress: () => setIsSearching(true) },
          { label: 'Export chat', onPress: exportChat },
          ...(!isSelf
            ? [
                { label: isBlocked ? `Unblock ${recipient.name}` : `Block ${recipient.name}`, onPress: toggleBlock, danger: !isBlocked },
                { label: `Report ${recipient.name}`, onPress: () => chooseReport((reason) => submitReport(reason)), danger: true },
              ]
            : []),
        ]}
      />

      <ForwardPicker
        visible={Boolean(forwardSource)}
        accessToken={accessToken}
        onClose={() => setForwardSource(null)}
        onSend={async (targets) => {
          try {
            await forwardMessage(accessToken, forwardSource!.messageId!, targets);
          } catch (err: any) {
            Alert.alert('Could not forward', err?.message || 'Please try again.');
            throw err;
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  searchInput: { flex: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 8 : 4, fontSize: 15, marginRight: 8 },
  searchResults: { maxHeight: 260, borderBottomWidth: 1 },
  searchRow: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  pinnedBanner: { paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: 1 },
  dateRow: { alignItems: 'center', marginVertical: 8 },
  dateChip: { fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  scrollDown: { position: 'absolute', right: 16, bottom: 76, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  composerContext: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderLeftWidth: 4, borderLeftColor: '#06CF9C' },
  blockedBar: { justifyContent: 'center', paddingVertical: 16 },
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
  typingBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  typingDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 14,
    width: 34,
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

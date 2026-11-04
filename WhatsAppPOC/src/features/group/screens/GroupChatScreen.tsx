import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../core/theme';
import { connectSocket, socket } from '../../../services/socket';
import { ForwardPicker } from '../../chat/components/ForwardPicker';
import { mergeMessages, newClientMessageId, updateMessage, withDateSeparators } from '../../chat/utils/messageList';
import * as api from '../api/groupApi';
import { GroupInfoModal } from './GroupInfoModal';
import { RegisteredContact } from '../../contacts/hooks/useContactSync';
import { MediaAttachment } from '../../../components/media/MediaAttachment';
import { chooseAttachment } from '../../../components/media/attachmentPicker';
import { VoiceRecorder } from '../../../components/media/VoiceRecorder';
import { LocalFile, MediaKind, uploadFile } from '../../../services/media/mediaService';

export type GroupChatMessage = Omit<api.GroupMessage, 'messageId'> & {
  localId: string;
  messageId?: string;
  uploadProgress?: number;
  localFile?: LocalFile;
};

const SEND_TIMEOUT_MS = 15000;
const DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;

const fromServer = (m: api.GroupMessage): GroupChatMessage => ({ ...m, localId: m.messageId });
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

interface Props {
  accessToken: string;
  groupId: string;
  initialName: string;
  contacts?: RegisteredContact[];
  onBack: () => void;
}

export const GroupChatScreen: React.FC<Props> = ({ accessToken, groupId, initialName, contacts, onBack }) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<api.GroupInfo | null>(null);
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<GroupChatMessage | null>(null);
  const [forwardSource, setForwardSource] = useState<GroupChatMessage | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [removed, setRemoved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const listRef = useRef<FlatList>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const isTyping = useRef(false);
  const messagesRef = useRef<GroupChatMessage[]>([]);
  messagesRef.current = messages;

  const rows = useMemo(() => withDateSeparators(messages), [messages]);
  const nameById = useMemo(() => new Map((info?.members ?? []).map((m) => [m.userOrganizationId, m.name])), [info]);
  const canSend = !removed && info !== null && (!info.onlyAdminsCanSend || info.isAdmin);
  const scrollToEnd = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

  const loadInfo = useCallback(() => {
    api.getGroup(accessToken, groupId).then(setInfo).catch((err) => setError(err?.message || 'Could not load group'));
  }, [accessToken, groupId]);

  const loadLatest = useCallback(async () => {
    const page = await api.getGroupMessages(accessToken, groupId);
    setMessages((current) => mergeMessages(current, page.messages.map(fromServer)));
    setHasMore(page.pagination.hasMore);
    setCursor(page.pagination.nextCursor);
    const undelivered = page.messages.filter((m) => !m.isMine).map((m) => m.messageId);
    if (undelivered.length) socket.emit('group:message:delivered', { messageIds: undelivered });
    socket.emit('group:message:read', { groupId });
  }, [accessToken, groupId]);

  useEffect(() => {
    connectSocket(accessToken);
    loadInfo();
    loadLatest()
      .then(() => scrollToEnd())
      .catch((err) => setError(err?.message || 'Could not load messages'))
      .finally(() => setIsLoading(false));
  }, [accessToken, loadInfo, loadLatest]);

  const loadOlder = async () => {
    if (!hasMore || !cursor) return;
    const page = await api.getGroupMessages(accessToken, groupId, cursor);
    setMessages((current) => mergeMessages(current, page.messages.map(fromServer)));
    setHasMore(page.pagination.hasMore);
    setCursor(page.pagination.nextCursor);
  };

  const markFailed = useCallback((clientMessageId: string) => {
    timers.current.delete(clientMessageId);
    setMessages((current) => updateMessage(current, (m) => m.clientMessageId === clientMessageId && m.status === 'SENDING', () => ({ status: 'FAILED' })));
  }, []);

  const emitSend = useCallback(
    (message: GroupChatMessage) => {
      const id = message.clientMessageId!;
      clearTimeout(timers.current.get(id));
      timers.current.set(id, setTimeout(() => markFailed(id), SEND_TIMEOUT_MS));
      socket.emit('group:message:send', {
        groupId,
        message: message.message ?? '',
        clientMessageId: id,
        replyToMessageId: message.replyTo?.messageId ?? null,
        mediaId: message.media?.mediaId || null,
      });
    },
    [groupId, markFailed],
  );

  useEffect(() => {
    const pending = timers.current;
    const typing = typingTimers.current;
    return () => {
      pending.forEach(clearTimeout);
      typing.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    socket.emit('chat:active', { activeGroupId: groupId });

    const mine = (m: { groupId?: string }) => String(m?.groupId) === groupId;
    const onNew = (m: api.GroupMessage) => {
      if (!mine(m)) return;
      setMessages((current) => mergeMessages(current, [fromServer(m)]));
      if (!m.isMine) {
        socket.emit('group:message:delivered', { messageIds: [m.messageId] });
        socket.emit('group:message:read', { groupId });
      }
      scrollToEnd();
    };
    const onSent = (m: api.GroupMessage) => {
      if (!mine(m)) return;
      if (m.clientMessageId) {
        clearTimeout(timers.current.get(m.clientMessageId));
        timers.current.delete(m.clientMessageId);
      }
      setMessages((current) => mergeMessages(current, [fromServer(m)]));
    };
    const onError = (e: { clientMessageId?: string | null; groupId?: string; message?: string }) => {
      if (String(e?.groupId) !== groupId) return;
      if (e.clientMessageId) markFailed(e.clientMessageId);
      setError(e?.message || 'Message not sent');
    };
    const onUpdated = (data: { message: api.GroupMessage }) => {
      if (mine(data?.message)) setMessages((current) => mergeMessages(current, [fromServer(data.message)]));
    };
    const onReceipt = (data: { groupId: string }) => {
      if (String(data?.groupId) === groupId) loadLatest().catch(() => undefined);
    };
    const onGroupUpdated = (data: { groupId: string }) => {
      if (String(data?.groupId) === groupId) loadInfo();
    };
    const onRemoved = (data: { groupId: string; reason: string }) => {
      if (String(data?.groupId) === groupId) setRemoved(data.reason === 'deleted' ? 'This group was deleted' : 'You are no longer a member of this group');
    };
    const onTyping = (on: boolean) => (data: { groupId: string; senderUserOrganizationId: string }) => {
      if (String(data?.groupId) !== groupId) return;
      const who = data.senderUserOrganizationId;
      clearTimeout(typingTimers.current.get(who));
      if (on) typingTimers.current.set(who, setTimeout(() => setTypingNames((n) => n.filter((x) => x !== who)), 3500));
      setTypingNames((names) => (on ? [...new Set([...names, who])] : names.filter((x) => x !== who)));
    };
    const onStart = onTyping(true);
    const onStop = onTyping(false);
    const onReconnect = () => {
      socket.emit('chat:active', { activeGroupId: groupId });
      loadLatest().catch(() => undefined);
      messagesRef.current.filter((m) => m.status === 'SENDING' && m.clientMessageId && m.uploadProgress === undefined).forEach(emitSend);
    };

    socket.on('group:message:new', onNew);
    socket.on('group:message:sent', onSent);
    socket.on('group:message:error', onError);
    socket.on('group:message:updated', onUpdated);
    socket.on('group:message:receipt', onReceipt);
    socket.on('group:updated', onGroupUpdated);
    socket.on('group:removed', onRemoved);
    socket.on('group:typing:start', onStart);
    socket.on('group:typing:stop', onStop);
    socket.on('connect', onReconnect);
    return () => {
      socket.emit('chat:inactive');
      socket.off('group:message:new', onNew);
      socket.off('group:message:sent', onSent);
      socket.off('group:message:error', onError);
      socket.off('group:message:updated', onUpdated);
      socket.off('group:message:receipt', onReceipt);
      socket.off('group:updated', onGroupUpdated);
      socket.off('group:removed', onRemoved);
      socket.off('group:typing:start', onStart);
      socket.off('group:typing:stop', onStop);
      socket.off('connect', onReconnect);
    };
  }, [groupId, loadInfo, loadLatest, markFailed, emitSend]);

  const changeText = (text: string) => {
    setInput(text);
    const typingNow = text.trim().length > 0;
    if (typingNow !== isTyping.current) {
      isTyping.current = typingNow;
      socket.emit(typingNow ? 'group:typing:start' : 'group:typing:stop', { groupId });
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    if (isTyping.current) {
      isTyping.current = false;
      socket.emit('group:typing:stop', { groupId });
    }
    const clientMessageId = newClientMessageId();
    const optimistic: GroupChatMessage = {
      localId: `local-${clientMessageId}`,
      clientMessageId,
      groupId,
      senderUserOrganizationId: '',
      senderName: 'You',
      message: text,
      messageType: 'TEXT',
      sendTime: new Date().toISOString(),
      isMine: true,
      forwarded: false,
      isDeleted: false,
      status: 'SENDING',
      replyTo: replyTo?.messageId
        ? { messageId: replyTo.messageId, senderUserOrganizationId: replyTo.senderUserOrganizationId, senderName: replyTo.senderName, message: replyTo.message, isDeleted: replyTo.isDeleted }
        : null,
    };
    setMessages((current) => mergeMessages(current, [optimistic]));
    setInput('');
    setReplyTo(null);
    scrollToEnd();
    if (socket.connected) emitSend(optimistic);
    else timers.current.set(clientMessageId, setTimeout(() => markFailed(clientMessageId), SEND_TIMEOUT_MS));
  };

  const uploadThenSend = async (m: GroupChatMessage) => {
    try {
      const media = await uploadFile(m.localFile!, m.media!.kind as MediaKind, (fraction) =>
        setMessages((current) => updateMessage(current, (x) => x.localId === m.localId, () => ({ uploadProgress: fraction }))),
      );
      const uploaded = { ...m, media, uploadProgress: undefined };
      setMessages((current) => updateMessage(current, (x) => x.localId === m.localId, () => uploaded));
      if (socket.connected) emitSend(uploaded);
    } catch (err: any) {
      setMessages((current) => updateMessage(current, (x) => x.localId === m.localId, () => ({ status: 'FAILED' })));
      setError(err?.message || 'Upload failed');
    }
  };

  const retry = (m: GroupChatMessage) => {
    setMessages((current) => updateMessage(current, (x) => x.localId === m.localId, () => ({ status: 'SENDING' })));
    if (m.uploadProgress !== undefined && m.localFile) uploadThenSend(m);
    else if (socket.connected) emitSend(m);
  };

  const sendAttachment = (file: LocalFile, kind: MediaKind) => {
    const clientMessageId = newClientMessageId();
    const optimistic: GroupChatMessage = {
      localId: `local-${clientMessageId}`,
      clientMessageId,
      groupId,
      senderUserOrganizationId: '',
      senderName: 'You',
      message: '',
      messageType: kind,
      sendTime: new Date().toISOString(),
      isMine: true,
      forwarded: false,
      isDeleted: false,
      status: 'SENDING',
      replyTo: null,
      uploadProgress: 0,
      localFile: file,
      media: { mediaId: '', kind, mimeType: file.type, fileName: file.name, size: file.size, width: null, height: null, durationMs: file.durationMs ?? null, hasThumbnail: false },
    };
    setMessages((current) => mergeMessages(current, [optimistic]));
    scrollToEnd();
    uploadThenSend(optimistic);
  };

  const attach = async () => {
    try {
      const picked = await chooseAttachment();
      if (picked) sendAttachment(picked.file, picked.kind);
    } catch (err: any) {
      setError(err?.message || 'Could not attach the file');
    }
  };

  const showReceipts = async (m: GroupChatMessage) => {
    try {
      const receipts = await api.getReceipts(accessToken, groupId, m.messageId!);
      const read = receipts.filter((r) => r.readAt).map((r) => r.name);
      const delivered = receipts.filter((r) => r.deliveredAt && !r.readAt).map((r) => r.name);
      const waiting = receipts.filter((r) => !r.deliveredAt).map((r) => r.name);
      Alert.alert(
        'Message info',
        [
          read.length ? `Read by: ${read.join(', ')}` : null,
          delivered.length ? `Delivered to: ${delivered.join(', ')}` : null,
          waiting.length ? `Not delivered yet: ${waiting.join(', ')}` : null,
        ].filter(Boolean).join('\n\n') || 'No one else is in this group',
      );
    } catch (err: any) {
      Alert.alert('Could not load info', err?.message);
    }
  };

  const actionsFor = (m: GroupChatMessage) => {
    if (!m.messageId || m.isDeleted || m.messageType === 'SYSTEM') return;
    const canDelete = m.isMine ? Date.now() - new Date(m.sendTime).getTime() <= DELETE_WINDOW_MS || info?.isAdmin : info?.isAdmin;
    Alert.alert('Message', undefined, [
      ...(canSend ? [{ text: 'Reply', onPress: () => setReplyTo(m) }] : []),
      { text: 'Forward', onPress: () => setForwardSource(m) },
      ...(m.isMine ? [{ text: 'Info', onPress: () => showReceipts(m) }] : []),
      ...(canDelete
        ? [{
            text: 'Delete for everyone',
            style: 'destructive' as const,
            onPress: () => api.deleteGroupMessage(accessToken, groupId, m.messageId!).catch((err) => Alert.alert('Could not delete', err?.message)),
          }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const subtitle = typingNames.length
    ? `${typingNames.map((id) => nameById.get(id) ?? 'Someone').join(', ')} typing…`
    : info
    ? `${info.members.length} members`
    : '';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0B141A' : '#EFEAE2' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border, paddingTop: 10 + (Platform.OS === 'ios' ? 0 : 0) }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Back">
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700', paddingRight: 8 }}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setIsInfoOpen(true)} accessibilityLabel="Group info">
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{info?.name ?? initialName}</Text>
          <Text style={{ color: typingNames.length ? theme.primary : theme.textSecondary, fontSize: 12 }} numberOfLines={1}>{subtitle}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        {error && (
          <TouchableOpacity style={{ padding: 8, alignItems: 'center', backgroundColor: theme.surface }} onPress={() => setError(null)}>
            <Text style={{ color: theme.error, fontSize: 12, fontWeight: '600' }}>⚠️ {error}</Text>
          </TouchableOpacity>
        )}

        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
          onScroll={(e) => e.nativeEvent.contentOffset.y <= 30 && loadOlder()}
          scrollEventThrottle={100}
          ListHeaderComponent={isLoading ? <ActivityIndicator color={theme.primary} /> : undefined}
          renderItem={({ item: row }) => {
            if (row.type === 'date') {
              return (
                <View style={styles.center}>
                  <Text style={[styles.chip, { backgroundColor: isDark ? '#182229' : '#FFFFFF', color: theme.textSecondary }]}>{row.label}</Text>
                </View>
              );
            }
            const m = row.message;
            if (m.messageType === 'SYSTEM') {
              return (
                <View style={styles.center}>
                  <Text style={[styles.chip, { backgroundColor: isDark ? '#182229' : '#FFF5C4', color: theme.textSecondary }]}>{m.message}</Text>
                </View>
              );
            }
            const muted = isDark ? '#8696A0' : '#667781';
            return (
              <View style={{ flexDirection: 'row', justifyContent: m.isMine ? 'flex-end' : 'flex-start', marginVertical: 3 }}>
                <Pressable
                  onLongPress={() => actionsFor(m)}
                  onPress={() => m.status === 'FAILED' && retry(m)}
                  accessibilityHint={m.status === 'FAILED' ? 'Tap to send again' : 'Long press for options'}
                  style={[styles.bubble, { backgroundColor: m.isMine ? (isDark ? '#005C4B' : '#D9FDD3') : isDark ? '#202C33' : '#FFFFFF' }]}
                >
                  {!m.isMine && <Text style={{ color: '#06CF9C', fontSize: 12, fontWeight: '700' }}>{m.senderName}</Text>}
                  {m.forwarded && !m.isDeleted && <Text style={{ color: muted, fontSize: 11 }}>↪ Forwarded</Text>}
                  {m.replyTo && !m.isDeleted && (
                    <View style={[styles.quote, { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)' }]}>
                      <Text style={{ color: '#06CF9C', fontSize: 12, fontWeight: '700' }}>{m.replyTo.senderName}</Text>
                      <Text style={{ color: muted, fontSize: 13 }} numberOfLines={2}>{m.replyTo.isDeleted ? 'This message was deleted' : m.replyTo.message}</Text>
                    </View>
                  )}
                  {m.media && !m.isDeleted && (
                    <MediaAttachment
                      media={m.media}
                      textColor={isDark ? '#E9EDEF' : '#111B21'}
                      mutedColor={muted}
                      uploadProgress={m.uploadProgress}
                      localUri={m.uploadProgress !== undefined ? m.localFile?.uri : undefined}
                    />
                  )}
                  {(m.isDeleted || Boolean(m.message)) && (
                    <Text style={{ color: m.isDeleted ? muted : isDark ? '#E9EDEF' : '#111B21', fontSize: 15, fontStyle: m.isDeleted ? 'italic' : 'normal' }}>
                      {m.isDeleted ? '🚫 This message was deleted' : m.message}
                    </Text>
                  )}
                  <View style={styles.footer}>
                    <Text style={{ color: muted, fontSize: 11 }}>{time(m.sendTime)}</Text>
                    {m.isMine && (
                      <Text style={{ color: m.status === 'SEEN' ? '#53BDEB' : m.status === 'FAILED' ? '#E53935' : muted, fontSize: 11, marginLeft: 3 }}>
                        {m.status === 'SENDING' ? '…' : m.status === 'FAILED' ? '!' : m.status === 'SENT' ? '✓' : '✓✓'}
                      </Text>
                    )}
                  </View>
                  {m.status === 'FAILED' && <Text style={{ color: '#E53935', fontSize: 11 }}>Not sent. Tap to retry.</Text>}
                </Pressable>
              </View>
            );
          }}
        />

        {replyTo && (
          <View style={[styles.context, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>Replying to {replyTo.isMine ? 'yourself' : replyTo.senderName}</Text>
              <Text style={{ color: theme.textSecondary }} numberOfLines={1}>{replyTo.message}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply">
              <Text style={{ color: theme.textSecondary, fontSize: 18, padding: 4 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {canSend ? (
          <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            {isRecording ? (
              <VoiceRecorder
                color={theme.text}
                background={isDark ? '#2A3942' : '#F0F2F5'}
                onCancel={() => setIsRecording(false)}
                onRecorded={(file) => {
                  setIsRecording(false);
                  sendAttachment(file, 'VOICE');
                }}
              />
            ) : (
              <>
                <TouchableOpacity onPress={attach} accessibilityLabel="Attach a file" style={{ padding: 8 }}>
                  <Text style={{ fontSize: 20 }}>📎</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#2A3942' : '#F0F2F5', color: theme.text }]}
                  placeholder="Message"
                  placeholderTextColor={theme.placeholder}
                  value={input}
                  onChangeText={changeText}
                  multiline
                  maxLength={5000}
                />
                {input.trim() ? (
                  <TouchableOpacity style={[styles.send, { backgroundColor: theme.primary }]} onPress={send} accessibilityLabel="Send">
                    <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>➤</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.send, { backgroundColor: theme.primary }]} onPress={() => setIsRecording(true)} accessibilityLabel="Record a voice message">
                    <Text style={{ color: '#FFF', fontSize: 16 }}>🎤</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        ) : (
          <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border, justifyContent: 'center', paddingVertical: 16 }]}>
            <Text style={{ color: theme.textSecondary }}>{removed ?? 'Only admins can send messages'}</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <ForwardPicker
        visible={Boolean(forwardSource)}
        accessToken={accessToken}
        onClose={() => setForwardSource(null)}
        onSend={async (targets) => {
          try {
            await api.forwardGroupMessage(accessToken, groupId, forwardSource!.messageId!, targets);
          } catch (err: any) {
            Alert.alert('Could not forward', err?.message);
            throw err;
          }
        }}
      />

      {info && (
        <GroupInfoModal
          visible={isInfoOpen}
          accessToken={accessToken}
          info={info}
          contacts={contacts}
          onClose={() => setIsInfoOpen(false)}
          onChanged={loadInfo}
          onLeft={onBack}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1 },
  center: { alignItems: 'center', marginVertical: 6 },
  chip: { fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', textAlign: 'center', maxWidth: '85%' },
  bubble: { maxWidth: '80%', borderRadius: 10, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 5, elevation: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 1, shadowOffset: { width: 0, height: 1 } },
  quote: { borderLeftWidth: 4, borderLeftColor: '#06CF9C', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginVertical: 3 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 3 },
  context: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderLeftWidth: 4, borderLeftColor: '#06CF9C' },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 8, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 8 : 6, fontSize: 15, maxHeight: 100, marginRight: 6 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});

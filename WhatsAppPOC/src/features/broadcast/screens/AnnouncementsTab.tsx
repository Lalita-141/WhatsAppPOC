import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../../core/theme';
import { socket } from '../../../services/socket';
import * as api from '../api/broadcastApi';

interface Props {
  accessToken: string;
  onUnreadChange?: (count: number) => void;
}

const when = (value: string) => new Date(value).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const AnnouncementsTab: React.FC<Props> = ({ accessToken, onUnreadChange }) => {
  const { theme } = useTheme();
  const [view, setView] = useState<'inbox' | 'sent'>('inbox');
  const [inbox, setInbox] = useState<api.ReceivedBroadcast[]>([]);
  const [sent, setSent] = useState<api.SentBroadcast[]>([]);
  const [targets, setTargets] = useState<api.BroadcastTarget[]>([]);
  const [canSend, setCanSend] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<api.ReceivedBroadcast | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [stats, setStats] = useState<{ item: api.SentBroadcast; data: api.BroadcastStats } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [received, mine, allowed] = await Promise.all([api.getInbox(accessToken), api.getSent(accessToken), api.getTargets(accessToken)]);
      setInbox(received.broadcasts);
      onUnreadChange?.(received.unreadCount);
      setSent(mine.broadcasts);
      setTargets(allowed.organizations);
      setCanSend(allowed.canSend);
    } catch (err: any) {
      setError(err?.message || 'Could not load announcements');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, onUnreadChange]);

  useEffect(() => {
    load();
    socket.on('broadcast:new', load);
    return () => {
      socket.off('broadcast:new', load);
    };
  }, [load]);

  const open = (item: api.ReceivedBroadcast) => {
    setOpened(item);
    setReplyText('');
    if (!item.readAt) {
      api.markBroadcastRead(accessToken, item.broadcastId).then(load).catch(() => undefined);
    }
  };

  const sendReply = async () => {
    if (!opened || !replyText.trim()) return;
    try {
      await api.replyToBroadcast(accessToken, opened.broadcastId, replyText.trim());
      setOpened(null);
      Alert.alert('Reply sent', `Your reply was sent to ${opened.senderName} as a private message.`);
    } catch (err: any) {
      Alert.alert('Could not reply', err?.message || 'Please try again.');
    }
  };

  const openStats = async (item: api.SentBroadcast) => {
    try {
      setStats({ item, data: await api.getStats(accessToken, item.broadcastId) });
    } catch (err: any) {
      Alert.alert('Could not load statistics', err?.message || 'Please try again.');
    }
  };

  if (isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.segment}>
        {(['inbox', 'sent'] as const).map((key) => (
          <TouchableOpacity
            key={key}
            onPress={() => setView(key)}
            style={[styles.chip, { backgroundColor: view === key ? theme.primary : theme.surface }]}
          >
            <Text style={{ color: view === key ? theme.surface : theme.text, fontWeight: '600' }}>
              {key === 'inbox' ? 'Received' : 'Sent'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <Text style={{ color: theme.error, paddingHorizontal: 16 }}>{error}</Text>}

      {view === 'inbox' ? (
        <FlatList
          data={inbox}
          keyExtractor={(item) => item.broadcastId}
          onRefresh={load}
          refreshing={false}
          ListEmptyComponent={<Text style={[styles.empty, { color: theme.textSecondary }]}>No announcements yet</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.item, { borderBottomColor: theme.border }]} onPress={() => open(item)}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: item.readAt ? '500' : '800' }} numberOfLines={1}>
                  {item.title || item.message}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {item.senderName} · {item.senderOrganizationName} · {when(item.createdAt)}
                </Text>
              </View>
              {!item.readAt && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={sent}
          keyExtractor={(item) => item.broadcastId}
          onRefresh={load}
          refreshing={false}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              {canSend ? 'You have not sent any broadcasts' : 'Your organization has not given you broadcast permission'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.item, { borderBottomColor: theme.border }]} onPress={() => openStats(item)}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '600' }} numberOfLines={1}>{item.title || item.message}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {item.recipients} recipients · {when(item.createdAt)}
                </Text>
              </View>
              <Text style={{ color: theme.primary }}>Stats ›</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {canSend && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: theme.primary }]} onPress={() => setIsComposing(true)} accessibilityLabel="New broadcast">
          <Text style={{ color: '#FFF', fontSize: 24 }}>📣</Text>
        </TouchableOpacity>
      )}

      {/* Read one announcement */}
      <Modal visible={Boolean(opened)} animationType="slide" onRequestClose={() => setOpened(null)}>
        {opened && (
          <View style={[styles.modal, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{opened.title || 'Announcement'}</Text>
              <TouchableOpacity onPress={() => setOpened(null)}>
                <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={{ color: theme.textSecondary, marginBottom: 12 }}>
                From {opened.senderName}, {opened.senderOrganizationName} · {when(opened.createdAt)}
              </Text>
              <Text style={{ color: theme.text, fontSize: 16, lineHeight: 22 }} selectable>{opened.message}</Text>
              {opened.isAnnouncement ? (
                <Text style={{ color: theme.textSecondary, marginTop: 24, fontSize: 12 }}>Replies are turned off for this announcement.</Text>
              ) : (
                <View style={{ marginTop: 24 }}>
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                    value={replyText}
                    onChangeText={setReplyText}
                    placeholder={`Reply privately to ${opened.senderName}`}
                    placeholderTextColor={theme.placeholder}
                    multiline
                    maxLength={5000}
                  />
                  <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]} onPress={sendReply} disabled={!replyText.trim()}>
                    <Text style={{ color: theme.surface, fontWeight: '700' }}>Send reply</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>

      <ComposeBroadcast
        visible={isComposing}
        accessToken={accessToken}
        targets={targets}
        onClose={() => setIsComposing(false)}
        onSent={() => {
          setIsComposing(false);
          setView('sent');
          load();
        }}
      />

      {/* Delivery statistics */}
      <Modal visible={Boolean(stats)} animationType="slide" onRequestClose={() => setStats(null)}>
        {stats && (
          <View style={[styles.modal, { backgroundColor: theme.background }]}>
            <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
              <Text style={[styles.title, { color: theme.text }]}>Delivery</Text>
              <TouchableOpacity onPress={() => setStats(null)}>
                <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>
                {stats.data.totals.read} read · {stats.data.totals.delivered} delivered · {stats.data.totals.recipients} recipients
              </Text>
              <Text style={[styles.section, { color: theme.textSecondary }]}>By organization</Text>
              {stats.data.organizations.map((o) => (
                <View key={o.organizationId} style={[styles.item, { borderBottomColor: theme.border }]}>
                  <Text style={{ color: theme.text, flex: 1 }}>{o.organizationName}</Text>
                  <Text style={{ color: theme.textSecondary }}>{o.read}/{o.delivered}/{o.recipients}</Text>
                </View>
              ))}
              <Text style={[styles.section, { color: theme.textSecondary }]}>Your organization</Text>
              {stats.data.ownMembers.map((m) => (
                <View key={m.userOrganizationId} style={[styles.item, { borderBottomColor: theme.border }]}>
                  <Text style={{ color: theme.text, flex: 1 }}>{m.name}</Text>
                  <Text style={{ color: m.readAt ? theme.success : theme.textSecondary }}>
                    {m.readAt ? 'Read' : m.deliveredAt ? 'Delivered' : 'Sent'}
                  </Text>
                </View>
              ))}
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 12 }}>
                Other organizations show totals only. Their members are never listed.
              </Text>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
};

const ComposeBroadcast: React.FC<{
  visible: boolean;
  accessToken: string;
  targets: api.BroadcastTarget[];
  onClose: () => void;
  onSent: () => void;
}> = ({ visible, accessToken, targets, onClose, onSent }) => {
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isAnnouncement, setIsAnnouncement] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelected(targets.filter((t) => t.isOwn).map((t) => t.organizationId));
    }
  }, [visible, targets]);

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const send = async () => {
    setIsSending(true);
    try {
      const result = await api.sendBroadcast(accessToken, {
        title: title.trim() || undefined,
        message: message.trim(),
        isAnnouncement,
        targets: selected.map((organizationId) => ({ organizationId })),
      });
      setTitle('');
      setMessage('');
      Alert.alert('Broadcast sent', `Delivered to ${result.recipients} people.`);
      onSent();
    } catch (err: any) {
      Alert.alert('Could not send', err?.message || 'Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.primary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>New broadcast</Text>
          <TouchableOpacity onPress={send} disabled={isSending || !message.trim() || selected.length === 0}>
            <Text style={{ color: message.trim() && selected.length ? theme.primary : theme.textSecondary, fontWeight: '700', fontSize: 16 }}>
              {isSending ? 'Sending…' : 'Send'}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} value={title} onChangeText={setTitle} placeholder="Title (optional)" placeholderTextColor={theme.placeholder} maxLength={150} />
          <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border, minHeight: 120 }]} value={message} onChangeText={setMessage} placeholder="Message" placeholderTextColor={theme.placeholder} multiline maxLength={5000} textAlignVertical="top" />
          <View style={styles.row}>
            <Text style={{ color: theme.text, flex: 1 }}>Announcement (no replies)</Text>
            <Switch value={isAnnouncement} onValueChange={setIsAnnouncement} />
          </View>
          <Text style={[styles.section, { color: theme.textSecondary }]}>Send to</Text>
          {targets.map((t) => (
            <TouchableOpacity key={t.organizationId} style={[styles.item, { borderBottomColor: theme.border }]} onPress={() => toggle(t.organizationId)}>
              <Text style={{ color: theme.text, flex: 1 }}>{t.organizationName}{t.isOwn ? ' (your organization)' : ''}</Text>
              <Text style={{ color: selected.includes(t.organizationId) ? theme.primary : theme.textSecondary, fontSize: 18 }}>
                {selected.includes(t.organizationId) ? '☑' : '☐'}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            Only organizations your organization may communicate with are listed. Recipients see your name and organization, never the other recipients.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  modal: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 12 },
  title: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15 },
  button: { marginTop: 10, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  section: { fontSize: 13, fontWeight: '700', marginTop: 8 },
});

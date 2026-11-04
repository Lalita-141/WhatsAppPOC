import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { ApiChatMessage, getStarredMessages, setStarred } from '../api/chatApi';

interface Props {
  visible: boolean;
  accessToken: string;
  onClose: () => void;
}

export const StarredMessagesModal: React.FC<Props> = ({ visible, accessToken, onClose }) => {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<ApiChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (from: string | null) => {
    setIsLoading(true);
    setError(null);
    try {
      const page = await getStarredMessages(accessToken, from);
      setMessages((current) => (from ? [...current, ...page.messages] : page.messages));
      setCursor(page.pagination?.nextCursor ?? null);
      setHasMore(Boolean(page.pagination?.hasMore));
    } catch (err: any) {
      setError(err?.message || 'Could not load starred messages');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      load(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const unstar = async (messageId: string) => {
    setMessages((current) => current.filter((m) => m.messageId !== messageId));
    await setStarred(accessToken, messageId, false).catch(() => load(null));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Starred messages</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }}>Done</Text>
          </TouchableOpacity>
        </View>
        {error && <Text style={{ color: theme.error, padding: 16 }}>{error}</Text>}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.messageId}
          onEndReached={() => hasMore && !isLoading && load(cursor)}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
            ) : (
              <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>
                Long press a message and choose Star to keep it here.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {item.isMine ? 'You' : 'Received'} · {new Date(item.sendTime).toLocaleString()}
                </Text>
                <Text style={{ color: theme.text, fontSize: 15, marginTop: 2 }}>{item.message}</Text>
              </View>
              <TouchableOpacity onPress={() => unstar(item.messageId)} accessibilityLabel="Unstar">
                <Text style={{ color: theme.warning, fontSize: 20 }}>★</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
});

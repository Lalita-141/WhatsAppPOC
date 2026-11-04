import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../../core/theme';
import { socket } from '../../../../services/socket';
import { Avatar } from '../../../../components/media/Avatar';
import { CallRecord, getCallHistory } from '../../../calls/api/callApi';
import { startCall } from '../../../calls/state/callStore';

const missed = (c: CallRecord) => c.direction === 'INCOMING' && (c.status === 'MISSED' || c.status === 'CANCELLED');

const describe = (c: CallRecord) => {
  const arrow = c.direction === 'OUTGOING' ? '↗' : '↙';
  const when = new Date(c.startedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const length = c.durationSeconds ? ` · ${Math.floor(c.durationSeconds / 60)}:${String(c.durationSeconds % 60).padStart(2, '0')}` : '';
  return `${arrow} ${when}${length}`;
};

/** Call history, with buttons to call back. */
export const CallsTab: React.FC = () => {
  const { theme } = useTheme();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    getCallHistory().then((page) => setCalls(page.calls)).catch(() => undefined).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
    socket.on('call:ended', load);
    return () => {
      socket.off('call:ended', load);
    };
  }, [load]);

  const call = (c: CallRecord, type: CallRecord['type']) =>
    startCall({ userOrganizationId: c.peer.userOrganizationId, name: c.peer.name }, type).catch((err) => Alert.alert('Could not call', err?.message));

  if (isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />;

  return (
    <FlatList
      data={calls}
      keyExtractor={(c) => c.callId}
      onRefresh={load}
      refreshing={false}
      ListEmptyComponent={
        <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 }}>
          No calls yet. Open a chat and tap the phone or camera button to call.
        </Text>
      }
      renderItem={({ item }) => (
        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          <Avatar name={item.peer.name} mediaId={item.peer.profilePhotoMediaId} size={46} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: missed(item) ? theme.error : theme.text, fontWeight: '600' }}>{item.peer.name}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {describe(item)} {item.status === 'MISSED' || item.status === 'REJECTED' || item.status === 'BUSY' ? `· ${item.status.toLowerCase()}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => call(item, 'AUDIO')} style={styles.action} accessibilityLabel={`Voice call ${item.peer.name}`}>
            <Text style={{ fontSize: 20 }}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => call(item, 'VIDEO')} style={styles.action} accessibilityLabel={`Video call ${item.peer.name}`}>
            <Text style={{ fontSize: 20 }}>📹</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  action: { padding: 8 },
});

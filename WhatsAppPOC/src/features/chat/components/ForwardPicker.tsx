import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { useConversationsQuery } from '../api/chatQueries';
import { ForwardTargets } from '../api/chatApi';
import { GroupSummary, listGroups } from '../../group/api/groupApi';

export const MAX_FORWARD = 5;

interface Props {
  visible: boolean;
  accessToken: string;
  onClose: () => void;
  onSend: (targets: ForwardTargets) => Promise<void>;
}

export const ForwardPicker: React.FC<Props> = ({ visible, accessToken, onClose, onSend }) => {
  const { theme } = useTheme();
  const { data, isLoading } = useConversationsQuery(accessToken, visible);
  const [selected, setSelected] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [groups, setGroups] = useState<GroupSummary[]>([]);

  useEffect(() => {
    if (visible) {
      listGroups(accessToken).then(setGroups).catch(() => setGroups([]));
    }
  }, [visible, accessToken]);

  // Groups and people share one list; group keys are prefixed so IDs cannot clash.
  const chats = [
    ...groups.map((g) => ({ key: `g:${g.groupId}`, label: `👥 ${g.name}` })),
    ...(data ?? [])
      .filter((c) => !c.isBlocked && !c.isDeletedAccount)
      .map((c) => ({ key: `u:${c.userOrganizationId}`, label: c.isSelf ? 'You' : c.name || c.mobileNo })),
  ];

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= MAX_FORWARD
        ? current
        : [...current, id],
    );

  const close = () => {
    setSelected([]);
    onClose();
  };

  const send = async () => {
    setIsSending(true);
    try {
      await onSend({
        receiverUserOrganizationIds: selected.filter((k) => k.startsWith('u:')).map((k) => k.slice(2)),
        groupIds: selected.filter((k) => k.startsWith('g:')).map((k) => k.slice(2)),
      });
      close();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
          <TouchableOpacity onPress={close}>
            <Text style={{ color: theme.primary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Forward to… ({selected.length}/{MAX_FORWARD})</Text>
          <TouchableOpacity onPress={send} disabled={selected.length === 0 || isSending}>
            <Text style={{ color: selected.length ? theme.primary : theme.textSecondary, fontSize: 16, fontWeight: '700' }}>
              {isSending ? 'Sending…' : 'Send'}
            </Text>
          </TouchableOpacity>
        </View>
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => {
              const isOn = selected.includes(item.key);
              return (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: theme.border }]}
                  onPress={() => toggle(item.key)}
                  accessibilityState={{ selected: isOn }}
                >
                  <Text style={{ color: theme.text, flex: 1, fontSize: 16 }}>{item.label}</Text>
                  <Text style={{ color: isOn ? theme.primary : theme.textSecondary, fontSize: 18 }}>{isOn ? '☑' : '☐'}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../../core/theme';
import { socket } from '../../../../services/socket';
import { GroupSummary, listGroups } from '../../../group/api/groupApi';
import * as api from '../../../updates/api/updatesApi';

interface Props {
  accessToken: string;
  onOpenGroup: (groupId: string, name: string) => void;
}

/** Communities the member belongs to, with their announcement group and linked groups. */
export const CommunitiesTab: React.FC<Props> = ({ accessToken, onOpenGroup }) => {
  const { theme } = useTheme();
  const [communities, setCommunities] = useState<api.Community[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [myGroups, setMyGroups] = useState<GroupSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(() => {
    api.getCommunities(accessToken).then(setCommunities).catch(() => undefined).finally(() => setIsLoading(false));
  }, [accessToken]);

  useEffect(() => {
    load();
    socket.on('group:added', load);
    return () => {
      socket.off('group:added', load);
    };
  }, [load]);

  const startCreating = async () => {
    setIsCreating(true);
    // Only groups the member runs can be brought into a new community.
    setMyGroups((await listGroups(accessToken).catch(() => [])).filter((g) => g.isAdmin));
  };

  const create = async () => {
    try {
      await api.createCommunity(accessToken, name.trim(), selected);
      setIsCreating(false);
      setName('');
      setSelected([]);
      load();
    } catch (err: any) {
      Alert.alert('Could not create community', err?.message || 'Please try again.');
    }
  };

  const join = async (community: api.Community, group: api.Community['groups'][number]) => {
    try {
      await api.joinCommunityGroup(accessToken, community.communityId, group.groupId);
      load();
      onOpenGroup(group.groupId, group.name);
    } catch (err: any) {
      Alert.alert('Could not join', err?.message || 'Please try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      <TouchableOpacity style={[styles.newButton, { borderColor: theme.primary }]} onPress={startCreating}>
        <Text style={{ color: theme.primary, fontWeight: '700' }}>+ New community</Text>
      </TouchableOpacity>

      {isLoading && <ActivityIndicator color={theme.primary} />}
      {!isLoading && communities.length === 0 && (
        <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 20 }}>
          Communities bring related groups together, with one announcement group for everyone in them.
        </Text>
      )}

      {communities.map((c) => (
        <View key={c.communityId} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>{c.name}</Text>
          {c.description ? <Text style={{ color: theme.textSecondary, marginTop: 2 }}>{c.description}</Text> : null}
          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => onOpenGroup(c.announcementGroupId, `${c.name} · Announcements`)}>
            <Text style={{ fontSize: 18, marginRight: 10 }}>📣</Text>
            <Text style={{ color: theme.text, flex: 1, fontWeight: '600' }}>Announcements</Text>
          </TouchableOpacity>
          {c.groups.map((g) => (
            <TouchableOpacity
              key={g.groupId}
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={() => (g.isMember ? onOpenGroup(g.groupId, g.name) : join(c, g))}
            >
              <Text style={{ fontSize: 18, marginRight: 10 }}>👥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text }}>{g.name}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{g.memberCount} members</Text>
              </View>
              {!g.isMember && <Text style={{ color: theme.primary, fontWeight: '700' }}>Join</Text>}
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <Modal visible={isCreating} animationType="slide" onRequestClose={() => setIsCreating(false)}>
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setIsCreating(false)}>
              <Text style={{ color: theme.primary }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 17 }}>New community</Text>
            <TouchableOpacity onPress={create} disabled={!name.trim()}>
              <Text style={{ color: name.trim() ? theme.primary : theme.textSecondary, fontWeight: '700' }}>Create</Text>
            </TouchableOpacity>
          </View>
          <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} value={name} onChangeText={setName} placeholder="Community name" placeholderTextColor={theme.placeholder} maxLength={150} />
          <Text style={{ color: theme.textSecondary, paddingHorizontal: 16 }}>Groups you admin to include:</Text>
          <ScrollView>
            {myGroups.length === 0 && <Text style={{ color: theme.textSecondary, padding: 16 }}>You do not admin any groups. You can still create the community and add groups later.</Text>}
            {myGroups.map((g) => {
              const on = selected.includes(g.groupId);
              return (
                <TouchableOpacity key={g.groupId} style={[styles.row, { borderBottomColor: theme.border, paddingHorizontal: 16 }]} onPress={() => setSelected((s) => (on ? s.filter((x) => x !== g.groupId) : [...s, g.groupId]))}>
                  <Text style={{ color: theme.text, flex: 1 }}>{g.name}</Text>
                  <Text style={{ color: on ? theme.primary : theme.textSecondary, fontSize: 18 }}>{on ? '☑' : '☐'}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  newButton: { borderWidth: 1, borderRadius: 20, paddingVertical: 10, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16, margin: 16 },
});

import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { RegisteredContact } from '../../contacts/hooks/useContactSync';
import * as api from '../api/groupApi';
import { MemberPicker } from './MemberPicker';

interface Props {
  visible: boolean;
  accessToken: string;
  info: api.GroupInfo;
  contacts?: RegisteredContact[];
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
}

export const GroupInfoModal: React.FC<Props> = ({ visible, accessToken, info, contacts = [], onClose, onChanged, onLeft }) => {
  const { theme } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(info.name);
  const [description, setDescription] = useState(info.description ?? '');
  const [isAdding, setIsAdding] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const canEditInfo = info.isAdmin || !info.onlyAdminsCanEditInfo;
  const isMuted = Boolean(info.mutedUntil);

  const run = async (task: () => Promise<unknown>, after?: () => void) => {
    try {
      await task();
      onChanged();
      after?.();
    } catch (err: any) {
      Alert.alert('Something went wrong', err?.message || 'Please try again.');
    }
  };

  const memberMenu = (member: api.GroupMember) => {
    if (!info.isAdmin || member.isYou) return;
    Alert.alert(member.name, member.organizationName ?? undefined, [
      member.role === 'ADMIN'
        ? { text: 'Dismiss as admin', onPress: () => run(() => api.setRole(accessToken, info.groupId, member.userOrganizationId, 'USER')) }
        : { text: 'Make group admin', onPress: () => run(() => api.setRole(accessToken, info.groupId, member.userOrganizationId, 'ADMIN')) },
      { text: 'Remove from group', style: 'destructive', onPress: () => run(() => api.removeMember(accessToken, info.groupId, member.userOrganizationId)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirm = (title: string, message: string, action: string, task: () => Promise<unknown>) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: 'destructive', onPress: () => run(task, () => { onClose(); onLeft(); }) },
    ]);

  const card = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }];
  const row = [styles.row, { borderBottomColor: theme.border }];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Group info</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }}>Done</Text>
          </TouchableOpacity>
        </View>

        {isAdding ? (
          <View style={{ flex: 1 }}>
            <View style={[styles.row, { paddingHorizontal: 16 }]}>
              <TouchableOpacity onPress={() => { setIsAdding(false); setToAdd([]); }}>
                <Text style={{ color: theme.primary }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ color: theme.text, flex: 1, textAlign: 'center', fontWeight: '700' }}>Add members</Text>
              <TouchableOpacity
                disabled={toAdd.length === 0}
                onPress={() => run(() => api.addMembers(accessToken, info.groupId, toAdd), () => { setIsAdding(false); setToAdd([]); })}
              >
                <Text style={{ color: toAdd.length ? theme.primary : theme.textSecondary, fontWeight: '700' }}>Add</Text>
              </TouchableOpacity>
            </View>
            <MemberPicker
              contacts={contacts}
              excludeIds={info.members.map((m) => m.userOrganizationId)}
              selected={toAdd}
              onToggle={(id) => setToAdd((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={card}>
              {isEditing ? (
                <>
                  <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} value={name} onChangeText={setName} maxLength={150} placeholder="Group name" placeholderTextColor={theme.placeholder} />
                  <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} value={description} onChangeText={setDescription} maxLength={500} placeholder="Description" placeholderTextColor={theme.placeholder} multiline />
                  <TouchableOpacity
                    onPress={() => run(() => api.updateGroup(accessToken, info.groupId, { name: name.trim(), description: description.trim() || null }), () => setIsEditing(false))}
                    disabled={!name.trim()}
                  >
                    <Text style={{ color: theme.primary, fontWeight: '700' }}>Save</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity disabled={!canEditInfo} onPress={() => setIsEditing(true)}>
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{info.name}</Text>
                  <Text style={{ color: theme.textSecondary, marginTop: 4 }}>{info.description || 'No description'}</Text>
                  {canEditInfo && <Text style={{ color: theme.primary, marginTop: 8 }}>Edit</Text>}
                </TouchableOpacity>
              )}
            </View>

            <View style={card}>
              <View style={row}>
                <Text style={{ color: theme.text, flex: 1 }}>Mute notifications</Text>
                <Switch value={isMuted} onValueChange={(v) => run(() => api.setGroupPreferences(accessToken, info.groupId, { muted: v ? 'forever' : false }))} />
              </View>
              {info.isAdmin && (
                <>
                  <View style={row}>
                    <Text style={{ color: theme.text, flex: 1 }}>Only admins can send messages</Text>
                    <Switch value={info.onlyAdminsCanSend} onValueChange={(v) => run(() => api.updateGroup(accessToken, info.groupId, { onlyAdminsCanSend: v }))} />
                  </View>
                  <View style={styles.row}>
                    <Text style={{ color: theme.text, flex: 1 }}>Only admins can edit group info</Text>
                    <Switch value={info.onlyAdminsCanEditInfo} onValueChange={(v) => run(() => api.updateGroup(accessToken, info.groupId, { onlyAdminsCanEditInfo: v }))} />
                  </View>
                </>
              )}
            </View>

            {info.isAdmin && (
              <View style={card}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Invite with a code</Text>
                {info.inviteCode ? (
                  <>
                    <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', letterSpacing: 1 }} selectable>{info.inviteCode}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12, marginVertical: 4 }}>
                      Anyone in an organization yours may talk to can join with this code. Share it only with people you trust.
                    </Text>
                    <TouchableOpacity onPress={() => run(() => api.revokeInviteLink(accessToken, info.groupId))}>
                      <Text style={{ color: theme.error, fontWeight: '600' }}>Revoke code</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity onPress={() => run(() => api.createInviteLink(accessToken, info.groupId))}>
                    <Text style={{ color: theme.primary, fontWeight: '600' }}>Create invite code</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{info.members.length} members</Text>
              {info.isAdmin && (
                <TouchableOpacity style={row} onPress={() => setIsAdding(true)}>
                  <Text style={{ color: theme.primary, fontWeight: '600' }}>+ Add members</Text>
                </TouchableOpacity>
              )}
              {info.members.map((m) => (
                <TouchableOpacity key={m.userOrganizationId} style={row} onPress={() => memberMenu(m)} disabled={!info.isAdmin || m.isYou}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '600' }}>{m.isYou ? 'You' : m.name}</Text>
                    {(m.organizationName || m.isSuspended) && (
                      <Text style={{ color: m.isSuspended ? theme.error : theme.textSecondary, fontSize: 12 }}>
                        {m.organizationName}{m.isSuspended ? ' · suspended (organizations no longer connected)' : ''}
                      </Text>
                    )}
                  </View>
                  {m.role === 'ADMIN' && <Text style={{ color: theme.success, fontSize: 12, fontWeight: '700' }}>Admin</Text>}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.action, { borderColor: theme.error }]} onPress={() => confirm('Leave group?', 'You will stop receiving messages from this group.', 'Leave', () => api.leaveGroup(accessToken, info.groupId))}>
              <Text style={{ color: theme.error, fontWeight: '700' }}>Leave group</Text>
            </TouchableOpacity>
            {info.isAdmin && (
              <TouchableOpacity style={[styles.action, { borderColor: theme.error, backgroundColor: theme.error }]} onPress={() => confirm('Delete group?', 'The group is closed for everyone.', 'Delete', () => api.deleteGroup(accessToken, info.groupId))}>
                <Text style={{ color: theme.surface, fontWeight: '700' }}>Delete group</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 8 },
  action: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
});

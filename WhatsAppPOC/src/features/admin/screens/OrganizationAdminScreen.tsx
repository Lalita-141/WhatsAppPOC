import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../../core/theme';
import { useAuthStore } from '../../auth/store/authStore';
import * as api from '../api/adminApi';

const POLICY_LABELS: Record<api.ExternalPolicy, string> = {
  INTERNAL_ONLY: 'Own organization only',
  SELECTED_ORGANIZATIONS: 'Approved organizations',
  ALL_ORGANIZATIONS: 'All organizations',
  DISABLED: 'Disabled (hidden from others)',
};
const SCOPE_LABELS: Record<api.PermissionScope, string> = { EVERYONE: 'Everyone', ADMINS: 'Admins only', NOBODY: 'Nobody' };

interface Props {
  visible: boolean;
  accessToken: string;
  onClose: () => void;
}

export const OrganizationAdminScreen: React.FC<Props> = ({ visible, accessToken, onClose }) => {
  const { theme } = useTheme();
  const selectedCountry = useAuthStore((s) => s.selectedCountry);

  const [settings, setSettings] = useState<api.OrganizationSettings | null>(null);
  const [members, setMembers] = useState<api.Member[]>([]);
  const [departments, setDepartments] = useState<api.Department[]>([]);
  const [invites, setInvites] = useState<api.Invite[]>([]);
  const [requests, setRequests] = useState<api.JoinRequest[]>([]);
  const [relationships, setRelationships] = useState<api.Relationship[]>([]);
  const [directory, setDirectory] = useState<api.DirectoryEntry[]>([]);
  const [audit, setAudit] = useState<api.AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteNumber, setInviteNumber] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, m, d, i, r, rel, dir, a] = await Promise.all([
        api.getOrgSettings(accessToken),
        api.getMembers(accessToken),
        api.getDepartments(accessToken),
        api.getInvites(accessToken),
        api.getJoinRequests(accessToken),
        api.getRelationships(accessToken),
        api.getDirectory(accessToken),
        api.getAuditLog(accessToken),
      ]);
      setSettings(s);
      setMembers(m.members);
      setDepartments(d);
      setInvites(i);
      setRequests(r);
      setRelationships(rel);
      setDirectory(dir);
      setAudit(a.entries);
    } catch (err: any) {
      setError(err?.message || 'Could not load organization settings');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (visible) {
      setIsLoading(true);
      load();
    }
  }, [visible, load]);

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await task();
      await load();
    } catch (err: any) {
      Alert.alert('Something went wrong', err?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const change = (changes: Partial<api.OrganizationSettings>) => run(() => api.updateOrgSettings(accessToken, changes));

  const choose = <T extends string>(title: string, labels: Record<T, string>, onPick: (value: T) => void) =>
    Alert.alert(title, undefined, [
      ...(Object.keys(labels) as T[]).map((value) => ({ text: labels[value], onPress: () => onPick(value) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const memberMenu = (member: api.Member) =>
    Alert.alert(member.name, member.phone, [
      member.role === 'ADMIN'
        ? { text: 'Remove admin role', onPress: () => run(() => api.updateMember(accessToken, member.userOrganizationId, { role: 'USER' })) }
        : { text: 'Make admin', onPress: () => run(() => api.updateMember(accessToken, member.userOrganizationId, { role: 'ADMIN' })) },
      {
        text: 'Set department',
        onPress: () =>
          Alert.alert('Department', undefined, [
            ...departments.map((d) => ({
              text: d.name,
              onPress: () => run(() => api.updateMember(accessToken, member.userOrganizationId, { departmentId: d.departmentId })),
            })),
            { text: 'No department', onPress: () => run(() => api.updateMember(accessToken, member.userOrganizationId, { departmentId: null })) },
            { text: 'Cancel', style: 'cancel' as const },
          ]),
      },
      ...(!member.isYou
        ? [{
            text: 'Remove from organization',
            style: 'destructive' as const,
            onPress: () =>
              Alert.alert(`Remove ${member.name}?`, 'They are logged out and cannot rejoin without a new invite.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => run(() => api.removeMember(accessToken, member.userOrganizationId)) },
              ]),
          }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const relationshipActions = (r: api.Relationship) => {
    const actions: { text: string; onPress: () => void; style?: 'destructive' }[] = [];
    if (r.status === 'PENDING' && r.direction === 'INCOMING') {
      actions.push({ text: 'Approve', onPress: () => run(() => api.actOnRelationship(accessToken, r.relationshipId, 'approve')) });
      actions.push({ text: 'Reject', style: 'destructive', onPress: () => run(() => api.actOnRelationship(accessToken, r.relationshipId, 'reject')) });
    }
    if (r.status === 'APPROVED' || (r.status === 'PENDING' && r.direction === 'OUTGOING')) {
      actions.push({ text: r.status === 'APPROVED' ? 'Revoke' : 'Withdraw request', style: 'destructive', onPress: () => run(() => api.actOnRelationship(accessToken, r.relationshipId, 'revoke')) });
    }
    if (r.status === 'REJECTED' || r.status === 'REVOKED') {
      actions.push({ text: 'Request again', onPress: () => run(() => api.requestRelationship(accessToken, r.organizationId)) });
    }
    if (actions.length) Alert.alert(r.organizationName, r.status, [...actions, { text: 'Cancel', style: 'cancel' }]);
  };

  const connectable = directory.filter((d) => !relationships.some((r) => r.organizationId === d.organizationId && (r.status === 'PENDING' || r.status === 'APPROVED')));

  const card = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }];
  const rowStyle = [styles.row, { borderBottomColor: theme.border }];
  const label = { color: theme.text, flex: 1 } as const;
  const value = { color: theme.primary, fontWeight: '600' as const };
  const input = [styles.input, { color: theme.text, borderColor: theme.border }];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Organization admin</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }}>Done</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />} keyboardShouldPersistTaps="handled">
            {error && <Text style={{ color: theme.error }}>{error}</Text>}
            {busy && <ActivityIndicator color={theme.primary} />}

            {settings && (
              <View style={card}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Communication</Text>
                <View style={rowStyle}>
                  <Text style={label}>Chat between colleagues</Text>
                  <Switch value={settings.internalChatEnabled} onValueChange={(v) => change({ internalChatEnabled: v })} disabled={busy} />
                </View>
                <TouchableOpacity style={rowStyle} onPress={() => choose('Chat with other organizations', POLICY_LABELS, (v) => change({ externalPolicy: v }))}>
                  <Text style={label}>Other organizations</Text>
                  <Text style={value}>{POLICY_LABELS[settings.externalPolicy]}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={rowStyle} onPress={() => choose('Who can create groups', SCOPE_LABELS, (v) => change({ groupCreation: v }))}>
                  <Text style={label}>Who can create groups</Text>
                  <Text style={value}>{SCOPE_LABELS[settings.groupCreation]}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={rowStyle} onPress={() => choose('Who can add people from other organizations', SCOPE_LABELS, (v) => change({ externalParticipants: v }))}>
                  <Text style={label}>Who can add external people to groups</Text>
                  <Text style={value}>{SCOPE_LABELS[settings.externalParticipants]}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={rowStyle} onPress={() => choose('Who can send broadcasts', SCOPE_LABELS, (v) => change({ broadcastPermission: v }))}>
                  <Text style={label}>Who can send broadcasts</Text>
                  <Text style={value}>{SCOPE_LABELS[settings.broadcastPermission]}</Text>
                </TouchableOpacity>
                <View style={rowStyle}>
                  <Text style={label}>File sharing</Text>
                  <Switch value={settings.fileSharingEnabled} onValueChange={(v) => change({ fileSharingEnabled: v })} disabled={busy} />
                </View>
                <TouchableOpacity
                  style={rowStyle}
                  onPress={() =>
                    choose('Largest upload', { '10': '10 MB', '25': '25 MB', '50': '50 MB', '100': '100 MB' }, (v) => change({ maxUploadMb: Number(v) }))
                  }
                >
                  <Text style={label}>Largest upload</Text>
                  <Text style={value}>{settings.maxUploadMb} MB</Text>
                </TouchableOpacity>
                <View style={rowStyle}>
                  <Text style={label}>Voice and video calls</Text>
                  <Switch value={settings.callsEnabled} onValueChange={(v) => change({ callsEnabled: v })} disabled={busy} />
                </View>
                <View style={styles.row}>
                  <Text style={label}>Anyone with the code can join</Text>
                  <Switch value={settings.joinMode === 'OPEN'} onValueChange={(v) => change({ joinMode: v ? 'OPEN' : 'APPROVAL' })} disabled={busy} />
                </View>
              </View>
            )}

            <View style={card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Join requests ({requests.length})</Text>
              {requests.length === 0 && <Text style={{ color: theme.textSecondary }}>No one is waiting</Text>}
              {requests.map((r) => (
                <View key={r.joinRequestId} style={rowStyle}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '600' }}>{r.name}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{r.phone}</Text>
                  </View>
                  <TouchableOpacity onPress={() => run(() => api.decideJoinRequest(accessToken, r.joinRequestId, 'approve'))} disabled={busy}>
                    <Text style={[value, { marginRight: 16 }]}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => run(() => api.decideJoinRequest(accessToken, r.joinRequestId, 'reject'))} disabled={busy}>
                    <Text style={{ color: theme.error, fontWeight: '600' }}>Reject</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Invite by phone number</Text>
              <View style={styles.inline}>
                <Text style={{ color: theme.textSecondary, marginRight: 6 }}>{selectedCountry?.countryCode ?? ''}</Text>
                <TextInput style={[input, { flex: 1 }]} value={inviteNumber} onChangeText={setInviteNumber} placeholder="Mobile number" placeholderTextColor={theme.placeholder} keyboardType="phone-pad" />
                <TouchableOpacity
                  disabled={busy || !inviteNumber.trim() || !selectedCountry}
                  onPress={() =>
                    run(async () => {
                      await api.createInvite(accessToken, selectedCountry!.countryId, inviteNumber.trim());
                      setInviteNumber('');
                    })
                  }
                >
                  <Text style={[value, { marginLeft: 10 }]}>Invite</Text>
                </TouchableOpacity>
              </View>
              {invites.map((i) => (
                <View key={i.inviteId} style={rowStyle}>
                  <Text style={label}>{i.phone}</Text>
                  <TouchableOpacity onPress={() => run(() => api.revokeInvite(accessToken, i.inviteId))} disabled={busy}>
                    <Text style={{ color: theme.error, fontWeight: '600' }}>Revoke</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Members ({members.length})</Text>
              {members.map((m) => (
                <TouchableOpacity key={m.userOrganizationId} style={rowStyle} onPress={() => memberMenu(m)}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '600' }}>{m.name}{m.isYou ? ' (you)' : ''}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                      {m.phone}{m.department ? ` · ${m.department.name}` : ''}
                    </Text>
                  </View>
                  {m.role === 'ADMIN' && <Text style={{ color: theme.success, fontWeight: '700' }}>Admin</Text>}
                </TouchableOpacity>
              ))}
            </View>

            <View style={card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Departments</Text>
              <View style={styles.inline}>
                <TextInput style={[input, { flex: 1 }]} value={departmentName} onChangeText={setDepartmentName} placeholder="New department" placeholderTextColor={theme.placeholder} maxLength={100} />
                <TouchableOpacity
                  disabled={busy || !departmentName.trim()}
                  onPress={() =>
                    run(async () => {
                      await api.createDepartment(accessToken, departmentName.trim());
                      setDepartmentName('');
                    })
                  }
                >
                  <Text style={[value, { marginLeft: 10 }]}>Add</Text>
                </TouchableOpacity>
              </View>
              {departments.map((d) => (
                <View key={d.departmentId} style={rowStyle}>
                  <Text style={label}>{d.name} ({d.memberCount})</Text>
                  <TouchableOpacity onPress={() => run(() => api.deleteDepartment(accessToken, d.departmentId))} disabled={busy}>
                    <Text style={{ color: theme.error, fontWeight: '600' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Partner organizations</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 6 }}>
                Used when "Other organizations" is set to approved organizations. Both organizations must allow each other.
              </Text>
              {relationships.map((r) => (
                <TouchableOpacity key={r.relationshipId} style={rowStyle} onPress={() => relationshipActions(r)}>
                  <Text style={label}>{r.organizationName}</Text>
                  <Text style={{ color: r.status === 'APPROVED' ? theme.success : theme.textSecondary, fontWeight: '600' }}>
                    {r.status === 'PENDING' ? (r.direction === 'INCOMING' ? 'Wants to connect' : 'Requested') : r.status.toLowerCase()}
                  </Text>
                </TouchableOpacity>
              ))}
              {connectable.length > 0 && (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() =>
                    Alert.alert('Connect with', undefined, [
                      ...connectable.map((d) => ({ text: d.organizationName, onPress: () => run(() => api.requestRelationship(accessToken, d.organizationId)) })),
                      { text: 'Cancel', style: 'cancel' as const },
                    ])
                  }
                >
                  <Text style={value}>+ Request a connection</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={card}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Audit log</Text>
              {audit.slice(0, 30).map((entry) => (
                <View key={entry.auditLogId} style={rowStyle}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text }}>{entry.action.replace(/_/g, ' ').toLowerCase()}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                      {entry.actorName || 'System'} · {new Date(entry.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
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
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 15 },
});

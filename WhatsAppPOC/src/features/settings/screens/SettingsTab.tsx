import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ThemeMode, useTheme } from '../../../core/theme';
import { useAuthStore } from '../../auth/store/authStore';
import {
  deleteAccount,
  getOrganizations,
  getNotificationSettings,
  getPrivacySettings,
  getProfile,
  NotificationSettings,
  updateNotificationSettings,
  getSessions,
  logoutAllDevices,
  Membership,
  PrivacyLevel,
  PrivacySettings,
  Profile,
  revokeSession,
  Session,
  switchOrganization,
  updatePrivacySettings,
  updateProfile,
} from '../api/settingsApi';
import { BlockedUser, getBlockedUsers, unblockUser } from '../../chat/api/chatApi';
import { StarredMessagesModal } from '../../chat/components/StarredMessagesModal';
import { OrganizationAdminScreen } from '../../admin/screens/OrganizationAdminScreen';
import { Avatar } from '../../../components/media/Avatar';
import { pickFromLibrary } from '../../../components/media/attachmentPicker';
import { setProfilePhoto, uploadFile } from '../../../services/media/mediaService';
import { disableAppLock, enableAppLock, isAppLockEnabled } from '../../security/appLock';

const PRIVACY_LEVELS: PrivacyLevel[] = ['EVERYONE', 'CONTACTS', 'NOBODY'];
const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  EVERYONE: 'Everyone',
  CONTACTS: 'My contacts',
  NOBODY: 'Nobody',
};
const PRIVACY_ROWS: { key: keyof PrivacySettings; label: string }[] = [
  { key: 'lastSeenPrivacy', label: 'Last seen and online' },
  { key: 'profilePrivacy', label: 'Profile photo' },
  { key: 'aboutPrivacy', label: 'About' },
  { key: 'statusPrivacy', label: 'Status' },
];

const formatDate = (value: string) => {
  const date = new Date(value);
  return isNaN(date.getTime())
    ? ''
    : date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

interface SettingsTabProps {
  accessToken: string;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ accessToken }) => {
  const navigation = useNavigation();
  const { theme, themeMode, setThemeMode } = useTheme();
  const { handleLogout, applySwitchedSession, endSessionLocally } = useAuthStore();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [notifications, setNotifications] = useState<NotificationSettings | null>(null);
  const [isStarredOpen, setIsStarredOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [appLock, setAppLock] = useState(isAppLockEnabled);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [about, setAbout] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextProfile, nextMemberships, nextSessions, nextPrivacy, nextBlocked] = await Promise.all([
        getProfile(accessToken),
        getOrganizations(accessToken),
        getSessions(accessToken),
        getPrivacySettings(accessToken),
        getBlockedUsers(accessToken),
      ]);
      getNotificationSettings(accessToken).then(setNotifications).catch(() => setNotifications(null));
      setBlocked(nextBlocked);
      setProfile(nextProfile);
      setMemberships(nextMemberships);
      setSessions(nextSessions);
      setPrivacy(nextPrivacy);
    } catch (err: any) {
      setError(err?.message || 'Could not load settings');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: string, task: () => Promise<void>) => {
    setBusyAction(action);
    try {
      await task();
    } catch (err: any) {
      Alert.alert('Something went wrong', err?.message || 'Please try again.');
    } finally {
      setBusyAction(null);
    }
  };

  const startEditing = () => {
    setFirstName(profile?.firstName || '');
    setLastName(profile?.lastName || '');
    setAbout(profile?.about || '');
    setIsEditing(true);
  };

  const changePhoto = () =>
    Alert.alert('Profile photo', undefined, [
      {
        text: 'Choose photo',
        onPress: () =>
          run('photo', async () => {
            const picked = await pickFromLibrary(true);
            if (!picked) return;
            const media = await uploadFile(picked.file, 'AVATAR');
            await setProfilePhoto(media.mediaId);
            setProfile((current) => (current ? { ...current, profilePhotoMediaId: media.mediaId } : current));
          }),
      },
      ...(profile?.profilePhotoMediaId
        ? [{
            text: 'Remove photo',
            style: 'destructive' as const,
            onPress: () =>
              run('photo', async () => {
                await setProfilePhoto(null);
                setProfile((current) => (current ? { ...current, profilePhotoMediaId: null } : current));
              }),
          }]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const saveProfile = () => {
    if (!firstName.trim()) {
      Alert.alert('Name required', 'Please enter your first name.');
      return;
    }
    const changes: { first_name: string; last_name?: string; about?: string } = {
      first_name: firstName.trim(),
    };
    if (lastName.trim()) changes.last_name = lastName.trim();
    if (about.trim()) changes.about = about.trim();

    run('profile', async () => {
      setProfile(await updateProfile(accessToken, changes));
      setIsEditing(false);
    });
  };

  const changePrivacy = (changes: Partial<PrivacySettings>) =>
    run('privacy', async () => {
      setPrivacy(await updatePrivacySettings(accessToken, changes));
    });

  const choosePrivacy = (key: keyof PrivacySettings, label: string) => {
    Alert.alert(
      label,
      'Who can see this?',
      [
        ...PRIVACY_LEVELS.map((level) => ({
          text: PRIVACY_LABELS[level],
          onPress: () => changePrivacy({ [key]: level }),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const switchTo = (membership: Membership) =>
    run(`switch-${membership.userOrganizationId}`, async () => {
      const session = await switchOrganization(accessToken, membership.userOrganizationId);
      applySwitchedSession(session, navigation);
    });

  const endOtherSession = (session: Session) =>
    run(`session-${session.sessionId}`, async () => {
      await revokeSession(accessToken, session.sessionId);
      setSessions((current) => current.filter((item) => item.sessionId !== session.sessionId));
    });

  const confirmLogoutAll = () =>
    Alert.alert('Log out of all devices?', 'Every device, including this one, will need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out all',
        style: 'destructive',
        onPress: () =>
          run('logout-all', async () => {
            await logoutAllDevices(accessToken);
            endSessionLocally(navigation);
          }),
      },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'You will be removed from every organization and logged out everywhere. Messages you sent stay with the people who received them. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () =>
            run('delete', async () => {
              await deleteAccount(accessToken);
              endSessionLocally(navigation);
            }),
        },
      ],
    );

  const card = [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }];
  const input = [styles.input, { color: theme.text, borderColor: theme.border }];

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.primary} />}
    >
      {error && (
        <TouchableOpacity style={card} onPress={load}>
          <Text style={{ color: theme.error }}>{error}</Text>
          <Text style={{ color: theme.primary, marginTop: 6, fontWeight: '700' }}>Try again</Text>
        </TouchableOpacity>
      )}

      {/* Profile */}
      {profile && (
        <View style={card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Profile</Text>
          {isEditing ? (
            <>
              <TextInput style={input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={theme.placeholder} maxLength={100} />
              <TextInput style={input} value={lastName} onChangeText={setLastName} placeholder="Last name (optional)" placeholderTextColor={theme.placeholder} maxLength={100} />
              <TextInput style={input} value={about} onChangeText={setAbout} placeholder="About (optional)" placeholderTextColor={theme.placeholder} maxLength={250} />
              <View style={styles.row}>
                <TouchableOpacity onPress={() => setIsEditing(false)}>
                  <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveProfile} disabled={busyAction === 'profile'}>
                  <Text style={{ color: theme.primary, fontWeight: '700' }}>
                    {busyAction === 'profile' ? 'Saving…' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity onPress={changePhoto} disabled={busyAction === 'photo'} style={{ alignSelf: 'center', marginBottom: 12 }} accessibilityLabel="Change profile photo">
              <Avatar name={profile.firstName} mediaId={profile.profilePhotoMediaId} size={88} />
              <Text style={{ color: theme.primary, textAlign: 'center', marginTop: 6 }}>
                {busyAction === 'photo' ? 'Uploading…' : 'Change photo'}
              </Text>
            </TouchableOpacity>
          )}
          {!isEditing && (
            <TouchableOpacity onPress={startEditing}>
              <Text style={[styles.name, { color: theme.text }]}>
                {[profile.firstName, profile.lastName].filter(Boolean).join(' ')}
              </Text>
              <Text style={{ color: theme.textSecondary }}>{profile.about || 'No about yet'}</Text>
              <Text style={{ color: theme.textSecondary, marginTop: 4 }}>{profile.mobileNo}</Text>
              <Text style={{ color: theme.primary, marginTop: 8, fontWeight: '600' }}>Edit profile</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Organizations */}
      <View style={card}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Organizations</Text>
        {memberships.map((membership) => (
          <View key={membership.userOrganizationId} style={[styles.listRow, { borderBottomColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '600' }}>{membership.organizationName}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{membership.orgCode}</Text>
            </View>
            {membership.isCurrent ? (
              <Text style={{ color: theme.success, fontWeight: '700' }}>Current</Text>
            ) : (
              <TouchableOpacity onPress={() => switchTo(membership)} disabled={busyAction !== null}>
                <Text style={{ color: theme.primary, fontWeight: '700' }}>
                  {busyAction === `switch-${membership.userOrganizationId}` ? 'Switching…' : 'Switch'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {memberships.some((m) => m.isCurrent && m.role === 'ADMIN') && (
        <TouchableOpacity style={card} onPress={() => setIsAdminOpen(true)}>
          <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 2 }]}>🛡  Organization admin</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Members, invites, permissions, partner organizations, audit log</Text>
        </TouchableOpacity>
      )}

      {/* Privacy */}
      {privacy && (
        <View style={card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Privacy</Text>
          {PRIVACY_ROWS.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.listRow, { borderBottomColor: theme.border }]}
              onPress={() => choosePrivacy(key, label)}
              disabled={busyAction === 'privacy'}
            >
              <Text style={{ color: theme.text, flex: 1 }}>{label}</Text>
              <Text style={{ color: theme.textSecondary }}>{PRIVACY_LABELS[privacy[key] as PrivacyLevel]}</Text>
            </TouchableOpacity>
          ))}
          <View style={[styles.listRow, { borderBottomColor: theme.border }]}>
            <Text style={{ color: theme.text, flex: 1 }}>Read receipts</Text>
            <Switch value={privacy.readReceipts} onValueChange={(value) => changePrivacy({ readReceipts: value })} disabled={busyAction === 'privacy'} />
          </View>
          <View style={styles.listRow}>
            <Text style={{ color: theme.text, flex: 1 }}>Typing indicator</Text>
            <Switch value={privacy.typingIndicator} onValueChange={(value) => changePrivacy({ typingIndicator: value })} disabled={busyAction === 'privacy'} />
          </View>
        </View>
      )}

      {/* Notifications */}
      {notifications && (
        <View style={card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Notifications</Text>
          {([
            ['messages', 'Messages'],
            ['groups', 'Groups'],
            ['announcements', 'Announcements'],
            ['showPreview', 'Show message text'],
          ] as [keyof NotificationSettings, string][]).map(([key, label], index, all) => (
            <View key={key} style={[styles.listRow, index < all.length - 1 ? { borderBottomColor: theme.border } : { borderBottomWidth: 0 }]}>
              <Text style={{ color: theme.text, flex: 1 }}>{label}</Text>
              <Switch
                value={notifications[key]}
                disabled={busyAction === 'notifications'}
                onValueChange={(value) =>
                  run('notifications', async () => setNotifications(await updateNotificationSettings(accessToken, { [key]: value })))
                }
              />
            </View>
          ))}
        </View>
      )}

      {/* App lock */}
      <View style={card}>
        <View style={[styles.listRow, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '600' }}>App lock</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Require Face ID, fingerprint or the device passcode to open the app</Text>
          </View>
          <Switch
            value={appLock}
            disabled={busyAction === 'lock'}
            onValueChange={(on) =>
              run('lock', async () => {
                await (on ? enableAppLock() : disableAppLock());
                setAppLock(on);
              })
            }
          />
        </View>
      </View>

      {/* Starred messages */}
      <TouchableOpacity style={card} onPress={() => setIsStarredOpen(true)}>
        <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>★  Starred messages</Text>
      </TouchableOpacity>

      {/* Blocked contacts */}
      <View style={card}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Blocked contacts</Text>
        {blocked.length === 0 ? (
          <Text style={{ color: theme.textSecondary }}>No blocked contacts</Text>
        ) : (
          blocked.map((person) => (
            <View key={person.userOrganizationId} style={[styles.listRow, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '600' }}>{person.name || person.mobileNo}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{person.mobileNo}</Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  run(`unblock-${person.userOrganizationId}`, async () => {
                    await unblockUser(accessToken, person.userOrganizationId);
                    setBlocked((current) => current.filter((item) => item.userOrganizationId !== person.userOrganizationId));
                  })
                }
                disabled={busyAction !== null}
              >
                <Text style={{ color: theme.primary, fontWeight: '700' }}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Devices */}
      <View style={card}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Logged-in devices</Text>
        {sessions.map((session) => (
          <View key={session.sessionId} style={[styles.listRow, { borderBottomColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '600' }}>
                {session.deviceName || session.deviceType || 'Unknown device'}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Last active {formatDate(session.lastUsedAt)}
              </Text>
            </View>
            {session.isCurrent ? (
              <Text style={{ color: theme.success, fontWeight: '700' }}>This device</Text>
            ) : (
              <TouchableOpacity onPress={() => endOtherSession(session)} disabled={busyAction !== null}>
                <Text style={{ color: theme.error, fontWeight: '700' }}>Log out</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {/* Theme */}
      <View style={card}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Theme</Text>
        <View style={styles.segment}>
          {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => {
            const isActive = themeMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => setThemeMode(mode)}
                style={[styles.segmentButton, { borderColor: theme.border, backgroundColor: isActive ? theme.primary : theme.background }]}
              >
                <Text style={{ color: isActive ? theme.surface : theme.text, fontWeight: isActive ? '700' : '500' }}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Account actions */}
      <TouchableOpacity style={[styles.action, { borderColor: theme.error }]} onPress={() => handleLogout(navigation)}>
        <Text style={[styles.actionText, { color: theme.error }]}>Log out</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.action, { borderColor: theme.error }]} onPress={confirmLogoutAll} disabled={busyAction !== null}>
        <Text style={[styles.actionText, { color: theme.error }]}>Log out of all devices</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.action, { borderColor: theme.error, backgroundColor: theme.error }]} onPress={confirmDelete} disabled={busyAction !== null}>
        <Text style={[styles.actionText, { color: theme.surface }]}>
          {busyAction === 'delete' ? 'Deleting…' : 'Delete account'}
        </Text>
      </TouchableOpacity>
      <OrganizationAdminScreen visible={isAdminOpen} accessToken={accessToken} onClose={() => setIsAdminOpen(false)} />
      <StarredMessagesModal visible={isStarredOpen} accessToken={accessToken} onClose={() => setIsStarredOpen(false)} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  name: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, fontSize: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  segment: { flexDirection: 'row', gap: 8 },
  segmentButton: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  action: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  actionText: { fontSize: 15, fontWeight: '700' },
});

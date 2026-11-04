import React, { useState, useEffect } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { useTheme } from '../../../core/theme';
import { useAuthStore } from '../../auth/store/authStore';
import { ChatsTab } from './tabs/ChatsTab';
import { SettingsTab } from '../../settings/screens/SettingsTab';
import { UpdatesTab } from './tabs/UpdatesTab';
import { CommunitiesTab } from './tabs/CommunitiesTab';
import { CallsTab } from './tabs/CallsTab';
import { initCallSignaling } from '../../calls/state/callStore';
import { GroupChatScreen } from '../../group/screens/GroupChatScreen';
import { CreateGroupModal, JoinGroupModal } from '../../group/screens/CreateGroupModal';
import { useContactSync } from '../../contacts/hooks/useContactSync';
import { ContactsModal } from '../../contacts/components/ContactsModal';
import { ChatScreen, ChatRecipient } from '../../chat/screens/ChatScreen';
import { LastMessage } from '../../chat/api/chatApi';
import { connectSocket } from '../../../services/socket';
import {
  registerDeviceTokenWithBackend,
  setupNotificationListeners,
  NotificationChatData,
  InAppNotice,
} from '../../../services/notificationService';

export const HomeScreen: React.FC = () => {
  type TabType = 'chats' | 'updates' | 'communities' | 'calls' | 'settings';
  const {
    apiBaseUrl,
    accessToken: latestAccessToken,
    nextStep,
  } = useAuthStore();
  // Fixed for this session. Token refresh must not re-run the effects below,
  // such as re-uploading contacts. fetchApi and the socket use the newest token.
  const [accessToken] = useState(latestAccessToken);
  const { theme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('chats');
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [updatesSection, setUpdatesSection] = useState<'status' | 'channels' | 'announcements'>('status');

  // Call our new contact sync hook
  const { isSyncing, syncMessage, syncedContacts } = useContactSync(apiBaseUrl, accessToken, nextStep === 'LOGIN');

  const [isContactsModalVisible, setIsContactsModalVisible] = useState(false);
  const [activeChatRecipient, setActiveChatRecipient] = useState<ChatRecipient | null>(null);
  const [activeGroup, setActiveGroup] = useState<{ groupId: string; name: string } | null>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isJoinGroupOpen, setIsJoinGroupOpen] = useState(false);
  const registeredContacts = syncedContacts?.registered ?? [];
  const [notice, setNotice] = useState<InAppNotice | null>(null);

  // Opens what a notification is about: a chat, a group or the announcements.
  const openFromNotification = (data: NotificationChatData) => {
    setNotice(null);
    if (data.type === 'GROUP_CHAT' && data.groupId) {
      setActiveChatRecipient(null);
      setActiveGroup({ groupId: data.groupId, name: data.groupName || 'Group' });
    } else if (data.type === 'BROADCAST' || data.type === 'CHANNEL_POST') {
      setActiveChatRecipient(null);
      setActiveGroup(null);
      setUpdatesSection(data.type === 'BROADCAST' ? 'announcements' : 'channels');
      setActiveTab('updates');
    } else if (data.type === 'INCOMING_CALL') {
      // Nothing to open: the server re-sends a still-ringing call when the socket connects.
      return;
    } else if (data.senderUserOrganizationId) {
      setActiveGroup(null);
      handleOpenChat({ userOrganizationId: data.senderUserOrganizationId, name: data.senderName || 'Chat' });
    }
  };

  const banner = notice ? (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => openFromNotification(notice.data)}
      accessibilityRole="button"
    >
      <Text style={{ color: theme.text, fontWeight: '700' }} numberOfLines={1}>{notice.title}</Text>
      <Text style={{ color: theme.textSecondary }} numberOfLines={2}>{notice.body}</Text>
    </TouchableOpacity>
  ) : null;

  const openNewMenu = () =>
    Alert.alert('Start', undefined, [
      { text: 'New chat', onPress: () => setIsContactsModalVisible(true) },
      { text: 'New group', onPress: () => setIsCreateGroupOpen(true) },
      { text: 'Join group with a code', onPress: () => setIsJoinGroupOpen(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  const [activeChatLastMessage, setActiveChatLastMessage] = useState<LastMessage | null>(null);
  const [chatRefreshKey, setChatRefreshKey] = useState(0);

  const handleOpenChat = (recipient: ChatRecipient, initialLastMessage?: LastMessage | null) => {
    setActiveChatRecipient(recipient);
    setActiveChatLastMessage(initialLastMessage || null);
  };

  useEffect(() => {
    if (accessToken) {
      connectSocket(accessToken);
    }
  }, [accessToken]);

  // Incoming calls can arrive on any screen.
  useEffect(() => initCallSignaling(), []);

  // Setup push notifications: register token with backend & listen for notification taps
  useEffect(() => {
    if (!accessToken) return;

    // Register FCM device token
    registerDeviceTokenWithBackend(accessToken);

    const unsubscribeNotifications = setupNotificationListeners(
      openFromNotification,
      () => (activeGroup ? `group:${activeGroup.groupId}` : activeChatRecipient?.userOrganizationId || null),
      setNotice,
    );

    return () => {
      unsubscribeNotifications();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, activeChatRecipient, activeGroup]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Render correct tab contents
  const renderTabContent = () => {
    switch (activeTab) {
      case 'chats':
        return (
          <ChatsTab
            key={chatRefreshKey}
            apiBaseUrl={apiBaseUrl}
            accessToken={accessToken}
            onOpenChat={handleOpenChat}
            onOpenGroup={(groupId, name) => setActiveGroup({ groupId, name })}
            onOpenContacts={() => setIsContactsModalVisible(true)}
          />
        );
      case 'updates':
        return (
          <UpdatesTab
            key={updatesSection}
            accessToken={accessToken}
            unreadAnnouncements={unreadAnnouncements}
            onUnreadAnnouncementsChange={setUnreadAnnouncements}
            initialSection={updatesSection}
          />
        );
      case 'communities':
        return <CommunitiesTab accessToken={accessToken} onOpenGroup={(groupId, name) => setActiveGroup({ groupId, name })} />;
      case 'calls':
        return <CallsTab />;
      case 'settings':
        return <SettingsTab accessToken={accessToken} />;
      default:
        return (
          <ChatsTab
            key={chatRefreshKey}
            apiBaseUrl={apiBaseUrl}
            accessToken={accessToken}
            onOpenChat={handleOpenChat}
            onOpenGroup={(groupId, name) => setActiveGroup({ groupId, name })}
            onOpenContacts={() => setIsContactsModalVisible(true)}
          />
        );
    }
  };

  if (activeGroup) {
    return (
      <View style={{ flex: 1 }}>
      <GroupChatScreen
        accessToken={accessToken}
        groupId={activeGroup.groupId}
        initialName={activeGroup.name}
        contacts={registeredContacts}
        onBack={() => {
          setActiveGroup(null);
          setChatRefreshKey((k) => k + 1);
        }}
      />
      {banner}
      </View>
    );
  }

  // Render ChatScreen directly when a conversation is open
  if (activeChatRecipient) {
    return (
      <View style={{ flex: 1 }}>
      <ChatScreen
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        recipient={activeChatRecipient}
        initialLastMessage={activeChatLastMessage}
        onBack={() => {
          setActiveChatRecipient(null);
          setChatRefreshKey((k) => k + 1);
        }}
        onMessageSent={() => setChatRefreshKey((k) => k + 1)}
      />
      {banner}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: isDark ? theme.text : theme.primary }]}>
          WhatsApp
        </Text>

        {/* Right Action Icons */}
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.profileAvatar, { backgroundColor: theme.border }]}
            onPress={() => setActiveTab('settings')}
            accessibilityLabel="Open settings"
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>Me</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync Status Banner */}
      {syncMessage && (
        <View style={{ backgroundColor: theme.surface, padding: 8, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Text style={{ color: isSyncing ? theme.primary : theme.text, fontSize: 12, fontWeight: '600' }}>
            {syncMessage}
          </Text>
        </View>
      )}

      {/* Main Tab Content */}
      <View style={{ flex: 1 }}>
        {renderTabContent()}

        {/* Floating Action Button for Chats Tab */}
        {activeTab === 'chats' && (
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: theme.primary }]}
            onPress={openNewMenu}
            accessibilityLabel="New chat or group"
          >
            <Text style={styles.fabIcon}>💬</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom Tab Navigation Bar */}
      <View style={[styles.tabBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('chats')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'chats' }}>
          <Text style={[styles.tabIcon, { color: activeTab === 'chats' ? theme.primary : theme.textSecondary }]}>
            💬
          </Text>
          <Text style={[styles.tabLabel, { color: activeTab === 'chats' ? theme.primary : theme.textSecondary, fontWeight: activeTab === 'chats' ? '700' : '500' }]}>
            Chats
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('updates')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'updates' }}>
          <Text style={[styles.tabIcon, { color: activeTab === 'updates' ? theme.primary : theme.textSecondary }]}>
            🔄{unreadAnnouncements > 0 ? ` ${unreadAnnouncements > 99 ? '99+' : unreadAnnouncements}` : ''}
          </Text>
          <Text style={[styles.tabLabel, { color: activeTab === 'updates' ? theme.primary : theme.textSecondary, fontWeight: activeTab === 'updates' ? '700' : '500' }]}>
            Updates
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('communities')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'communities' }}>
          <Text style={[styles.tabIcon, { color: activeTab === 'communities' ? theme.primary : theme.textSecondary }]}>
            👥
          </Text>
          <Text style={[styles.tabLabel, { color: activeTab === 'communities' ? theme.primary : theme.textSecondary, fontWeight: activeTab === 'communities' ? '700' : '500' }]}>
            Communities
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('calls')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'calls' }}>
          <Text style={[styles.tabIcon, { color: activeTab === 'calls' ? theme.primary : theme.textSecondary }]}>
            📞
          </Text>
          <Text style={[styles.tabLabel, { color: activeTab === 'calls' ? theme.primary : theme.textSecondary, fontWeight: activeTab === 'calls' ? '700' : '500' }]}>
            Calls
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('settings')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'settings' }}>
          <Text style={[styles.tabIcon, { color: activeTab === 'settings' ? theme.primary : theme.textSecondary }]}>
            ⚙️
          </Text>
          <Text style={[styles.tabLabel, { color: activeTab === 'settings' ? theme.primary : theme.textSecondary, fontWeight: activeTab === 'settings' ? '700' : '500' }]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>

      <CreateGroupModal
        visible={isCreateGroupOpen}
        accessToken={accessToken}
        contacts={registeredContacts}
        onClose={() => setIsCreateGroupOpen(false)}
        onCreated={(group) => setActiveGroup({ groupId: group.groupId, name: group.name })}
      />
      <JoinGroupModal
        visible={isJoinGroupOpen}
        accessToken={accessToken}
        onClose={() => setIsJoinGroupOpen(false)}
        onJoined={(group) => setActiveGroup({ groupId: group.groupId, name: group.name })}
      />
      {banner}
      <ContactsModal
        isVisible={isContactsModalVisible}
        onClose={() => setIsContactsModalVisible(false)}
        contacts={syncedContacts}
        onSelectContact={(contact) => {
          handleOpenChat({
            userOrganizationId: contact.userOrganizationId,
            name: contact.name,
            mobileNo: contact.phone,
          });
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 16,
    left: 12,
    right: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIcon: {
    padding: 4,
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    height: 60,
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalScroll: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  settingsCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tokenText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
  },
  profileDetails: {
    marginTop: 4,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonText: {
    fontSize: 12,
  },
  actionButton: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabIcon: {
    fontSize: 24,
    color: '#fff',
  },
});

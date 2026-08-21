import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme, ThemeMode } from '../../../core/theme';
import { useAuthStore } from '../../auth/store/authStore';
import { getMe, MeResponse } from '../../auth/api/authApi';
import { ChatsTab } from './tabs/ChatsTab';
import { UpdatesTab } from './tabs/UpdatesTab';
import { CommunitiesTab } from './tabs/CommunitiesTab';
import { CallsTab } from './tabs/CallsTab';
import { useContactSync } from '../../contacts/hooks/useContactSync';
import { ContactsModal } from '../../contacts/components/ContactsModal';
import { ChatScreen, ChatRecipient } from '../../chat/screens/ChatScreen';
import { LastMessage } from '../../chat/api/chatApi';

export const HomeScreen: React.FC = () => {
  type TabType = 'chats' | 'updates' | 'communities' | 'calls';
  const navigation = useNavigation();
  const {
    apiBaseUrl,
    accessToken,
    nextStep,
    handleLogout,
    testProfileSetupNavigate,
  } = useAuthStore();
  const { theme, isDark, themeMode, setThemeMode } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('chats');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Call our new contact sync hook
  const { isSyncing, syncMessage, syncedContacts } = useContactSync(apiBaseUrl, accessToken, nextStep === 'LOGIN');

  const [isContactsModalVisible, setIsContactsModalVisible] = useState(false);
  const [activeChatRecipient, setActiveChatRecipient] = useState<ChatRecipient | null>(null);
  const [activeChatLastMessage, setActiveChatLastMessage] = useState<LastMessage | null>(null);
  const [chatRefreshKey, setChatRefreshKey] = useState(0);

  const handleOpenChat = (recipient: ChatRecipient, initialLastMessage?: LastMessage | null) => {
    setActiveChatRecipient(recipient);
    setActiveChatLastMessage(initialLastMessage || null);
  };

  // Fetch user profile /me if successfully logged in
  useEffect(() => {
    if (nextStep === 'LOGIN') {
      const fetchProfile = async () => {
        setIsLoadingProfile(true);
        setProfileError(null);
        try {
          const data = await getMe(apiBaseUrl, accessToken);
          setProfile(data);
        } catch (err: any) {
          console.error(err);
          setProfileError(err.message || 'Failed to load user profile');
        } finally {
          setIsLoadingProfile(false);
        }
      };

      fetchProfile();
    }
  }, [apiBaseUrl, accessToken, nextStep]);

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
            onOpenContacts={() => setIsContactsModalVisible(true)}
          />
        );
      case 'updates':
        return <UpdatesTab />;
      case 'communities':
        return <CommunitiesTab />;
      case 'calls':
        return <CallsTab />;
      default:
        return (
          <ChatsTab
            key={chatRefreshKey}
            apiBaseUrl={apiBaseUrl}
            accessToken={accessToken}
            onOpenChat={handleOpenChat}
            onOpenContacts={() => setIsContactsModalVisible(true)}
          />
        );
    }
  };

  // Render ChatScreen directly when a conversation is open
  if (activeChatRecipient) {
    return (
      <ChatScreen
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        recipient={activeChatRecipient}
        initialLastMessage={activeChatLastMessage}
        onBack={() => setActiveChatRecipient(null)}
        onMessageSent={() => setChatRefreshKey(k => k + 1)}
      />
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
          <TouchableOpacity style={styles.headerIcon}>
            <Text style={{ fontSize: 20 }}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon}>
            <Text style={{ fontSize: 20 }}>🔍</Text>
          </TouchableOpacity>
          {/* Settings Profile Avatar */}
          <TouchableOpacity
            style={[styles.profileAvatar, { backgroundColor: theme.border }]}
            onPress={() => setIsSettingsOpen(true)}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>
              {profile ? 'Me' : '👤'}
            </Text>
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
            onPress={() => setIsContactsModalVisible(true)}
          >
            <Text style={styles.fabIcon}>💬</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom Tab Navigation Bar */}
      <View style={[styles.tabBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        {/* Chats Tab Button */}
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[styles.tabIcon, { color: activeTab === 'chats' ? theme.primary : theme.textSecondary }]}>
            💬
          </Text>
          <Text
            style={[
              styles.tabLabel,
              {
                color: activeTab === 'chats' ? theme.primary : theme.textSecondary,
                fontWeight: activeTab === 'chats' ? '700' : '500',
              },
            ]}
          >
            Chats
          </Text>
        </TouchableOpacity>

        {/* Updates Tab Button */}
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setActiveTab('updates')}
        >
          <Text style={[styles.tabIcon, { color: activeTab === 'updates' ? theme.primary : theme.textSecondary }]}>
            🔄
          </Text>
          <Text
            style={[
              styles.tabLabel,
              {
                color: activeTab === 'updates' ? theme.primary : theme.textSecondary,
                fontWeight: activeTab === 'updates' ? '700' : '500',
              },
            ]}
          >
            Updates
          </Text>
        </TouchableOpacity>

        {/* Communities Tab Button */}
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setActiveTab('communities')}
        >
          <Text style={[styles.tabIcon, { color: activeTab === 'communities' ? theme.primary : theme.textSecondary }]}>
            👥
          </Text>
          <Text
            style={[
              styles.tabLabel,
              {
                color: activeTab === 'communities' ? theme.primary : theme.textSecondary,
                fontWeight: activeTab === 'communities' ? '700' : '500',
              },
            ]}
          >
            Communities
          </Text>
        </TouchableOpacity>

        {/* Calls Tab Button */}
        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => setActiveTab('calls')}
        >
          <Text style={[styles.tabIcon, { color: activeTab === 'calls' ? theme.primary : theme.textSecondary }]}>
            📞
          </Text>
          <Text
            style={[
              styles.tabLabel,
              {
                color: activeTab === 'calls' ? theme.primary : theme.textSecondary,
                fontWeight: activeTab === 'calls' ? '700' : '500',
              },
            ]}
          >
            Calls
          </Text>
        </TouchableOpacity>
      </View>

      {/* Settings Modal Overlay */}
      <Modal visible={isSettingsOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Settings</Text>
              <TouchableOpacity onPress={() => setIsSettingsOpen(false)}>
                <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              {/* Account Details */}
              <View style={[styles.settingsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Verification Info</Text>

                <View style={styles.detailRow}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Flow Status</Text>
                  <View style={[styles.badge, { backgroundColor: nextStep === 'LOGIN' ? theme.success : theme.warning }]}>
                    <Text style={[styles.badgeText, { color: theme.surface }]}>{nextStep}</Text>
                  </View>
                </View>

                <Text style={[styles.label, { color: theme.textSecondary, marginTop: 12 }]}>Auth Token</Text>
                <Text
                  numberOfLines={2}
                  ellipsizeMode="tail"
                  style={[styles.tokenText, { color: theme.text, backgroundColor: theme.background }]}
                >
                  {accessToken}
                </Text>
              </View>

              {/* Profile Details (/me) */}
              {nextStep === 'LOGIN' && (
                <View style={[styles.settingsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>User Profile (/me)</Text>

                  {isLoadingProfile ? (
                    <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 16 }} />
                  ) : profileError ? (
                    <Text style={{ color: theme.error, fontSize: 13 }}>{profileError}</Text>
                  ) : profile ? (
                    <View style={styles.profileDetails}>
                      <View style={[styles.profileRow, { borderBottomColor: theme.border }]}>
                        <Text style={{ color: theme.textSecondary }}>User ID</Text>
                        <Text style={{ color: theme.text, fontWeight: '700' }}>{profile.userId}</Text>
                      </View>
                      <View style={[styles.profileRow, { borderBottomColor: theme.border }]}>
                        <Text style={{ color: theme.textSecondary }}>Organization ID</Text>
                        <Text style={{ color: theme.text, fontWeight: '700' }}>{profile.organizationId}</Text>
                      </View>
                      <View style={styles.profileRow}>
                        <Text style={{ color: theme.textSecondary }}>User Org ID</Text>
                        <Text style={{ color: theme.text, fontWeight: '700' }}>{profile.userOrganizationId}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={{ color: theme.textSecondary }}>No data loaded</Text>
                  )}
                </View>
              )}

              {/* Theme Selector */}
              <View style={[styles.settingsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Theme settings</Text>
                <View style={styles.buttonGroup}>
                  {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => {
                    const isActive = themeMode === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => setThemeMode(mode)}
                        style={[
                          styles.modeButton,
                          {
                            backgroundColor: isActive ? theme.primary : theme.background,
                            borderColor: theme.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modeButtonText,
                            {
                              color: isActive ? theme.surface : theme.text,
                              fontWeight: isActive ? '700' : '500',
                            },
                          ]}
                        >
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={{ gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.actionButton, { borderColor: theme.error }]}
                  onPress={() => {
                    setIsSettingsOpen(false);
                    handleLogout(navigation);
                  }}
                >
                  <Text style={[styles.actionButtonText, { color: theme.error }]}>Log Out</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, { borderColor: theme.primary }]}
                  onPress={() => {
                    setIsSettingsOpen(false);
                    testProfileSetupNavigate(navigation);
                  }}
                >
                  <Text style={[styles.actionButtonText, { color: theme.primary }]}>🔧 Test Profile Setup UI</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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

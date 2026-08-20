import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../../src/core/theme';
import { SyncedContacts, RegisteredContact, NotRegisteredContact } from '../hooks/useContactSync';

interface ContactsModalProps {
  isVisible: boolean;
  onClose: () => void;
  contacts: SyncedContacts | null;
  onSelectContact?: (contact: RegisteredContact) => void;
}

export const ContactsModal: React.FC<ContactsModalProps> = ({
  isVisible,
  onClose,
  contacts,
  onSelectContact,
}) => {
  const { theme, isDark } = useTheme();

  // Combine both lists with a type flag for rendering
  const allContacts = [
    ...(contacts?.registered.map(c => ({ ...c, type: 'registered' as const })) || []),
    ...(contacts?.notRegistered.map(c => ({ ...c, type: 'notRegistered' as const })) || []),
  ];

  const handleContactPress = (item: any) => {
    if (item.type === 'registered' && onSelectContact) {
      onSelectContact({
        userId: item.userId,
        userOrganizationId: item.userOrganizationId,
        name: item.name,
        phone: item.phone,
      });
      onClose();
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isRegistered = item.type === 'registered';
    const avatarLetter = item.name ? item.name.charAt(0).toUpperCase() : '?';

    return (
      <TouchableOpacity
        style={[styles.contactItem, { borderBottomColor: theme.border }]}
        onPress={() => handleContactPress(item)}
        disabled={!isRegistered}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: isRegistered ? theme.primary : theme.border }]}>
          <Text style={styles.avatarText}>{avatarLetter}</Text>
        </View>
        
        <View style={styles.contactDetails}>
          <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.contactPhone, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.phone}
          </Text>
        </View>

        {!isRegistered && (
          <TouchableOpacity style={[styles.inviteButton, { borderColor: theme.primary }]}>
            <Text style={[styles.inviteText, { color: theme.primary }]}>Invite</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'android' ? Math.max(insets.top, StatusBar.currentHeight || 0) : insets.top;
  const bottomInset = insets.bottom;

  return (
    <Modal visible={isVisible} animationType="slide" transparent statusBarTranslucent={true}>
      <View style={[styles.modalOverlay, { backgroundColor: theme.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
              paddingTop: topInset > 0 ? topInset + 6 : 12,
            },
          ]}
        >
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Select contact</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              {allContacts.length} contacts
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        {contacts ? (
          <FlatList
            data={allContacts}
            keyExtractor={(item, index) => `${item.phone}-${index}`}
            renderItem={renderItem}
            contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(bottomInset, 24) }]}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={{ color: theme.textSecondary }}>No contacts available</Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
  },
  listContainer: {
    paddingBottom: 24,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  contactDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  contactPhone: {
    fontSize: 13,
  },
  inviteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  inviteText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

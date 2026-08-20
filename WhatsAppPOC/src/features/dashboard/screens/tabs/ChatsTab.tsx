import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../../../core/theme';

interface ChatItem {
  id: string;
  name: string;
  avatar: string;
  avatarBg: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  readStatus: 'none' | 'sent' | 'delivered' | 'read';
}

export const ChatsTab: React.FC = () => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const mockChats: ChatItem[] = [
    {
      id: '1',
      name: 'John Doe',
      avatar: 'JD',
      avatarBg: '#5C6BC0',
      lastMessage: 'Are we still on for the POC demonstration at 4 PM?',
      time: '3:45 PM',
      unreadCount: 2,
      readStatus: 'none',
    },
    {
      id: '2',
      name: 'React Native Team 🚀',
      avatar: 'RN',
      avatarBg: '#26A69A',
      lastMessage: 'Jane: The new theme engine runs beautifully!',
      time: '2:30 PM',
      unreadCount: 0,
      readStatus: 'read',
    },
    {
      id: '3',
      name: 'Alice Smith',
      avatar: 'AS',
      avatarBg: '#EC407A',
      lastMessage: 'Sent a screenshot of the settings layout.',
      time: '11:15 AM',
      unreadCount: 0,
      readStatus: 'delivered',
    },
    {
      id: '4',
      name: 'WhatsApp Support',
      avatar: '💬',
      avatarBg: '#66BB6A',
      lastMessage: 'Your multi-device integration is now active.',
      time: 'Yesterday',
      unreadCount: 0,
      readStatus: 'read',
    },
    {
      id: '5',
      name: 'Bob Miller',
      avatar: 'BM',
      avatarBg: '#FFA726',
      lastMessage: 'Let me test the new verification OTP.',
      time: 'Monday',
      unreadCount: 1,
      readStatus: 'none',
    },
    {
      id: '6',
      name: 'Design Feedback Group',
      avatar: '🎨',
      avatarBg: '#AB47BC',
      lastMessage: 'Alex: Check out this dark mode transition!',
      time: '15/08/2026',
      unreadCount: 0,
      readStatus: 'sent',
    },
  ];

  const filteredChats = mockChats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderCheckmarks = (status: ChatItem['readStatus']) => {
    switch (status) {
      case 'sent':
        return <Text style={{ color: theme.placeholder, fontSize: 13, marginRight: 2 }}>✓</Text>;
      case 'delivered':
        return <Text style={{ color: theme.placeholder, fontSize: 13, marginRight: 2 }}>✓✓</Text>;
      case 'read':
        return <Text style={{ color: '#53BDEB', fontSize: 13, marginRight: 2 }}>✓✓</Text>;
      default:
        return null;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.placeholder, fontSize: 16, marginRight: 8 }}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search or ask Meta AI"
            placeholderTextColor={theme.placeholder}
          />
        </View>
      </View>

      {/* Chat List */}
      <ScrollView contentContainerStyle={styles.chatListContainer} keyboardShouldPersistTaps="handled">
        {filteredChats.map(chat => (
          <TouchableOpacity
            key={chat.id}
            style={[styles.chatItem, { borderBottomColor: theme.border }]}
          >
            {/* Avatar */}
            <View style={[styles.avatar, { backgroundColor: chat.avatarBg }]}>
              <Text style={styles.avatarText}>{chat.avatar}</Text>
            </View>

            {/* Middle Details */}
            <View style={styles.chatDetails}>
              <Text style={[styles.chatName, { color: theme.text }]} numberOfLines={1}>
                {chat.name}
              </Text>
              <View style={styles.messageRow}>
                {renderCheckmarks(chat.readStatus)}
                <Text
                  style={[
                    styles.lastMessage,
                    { color: chat.unreadCount > 0 ? theme.text : theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {chat.lastMessage}
                </Text>
              </View>
            </View>

            {/* Right Meta Info */}
            <View style={styles.chatMeta}>
              <Text
                style={[
                  styles.timeText,
                  { color: chat.unreadCount > 0 ? theme.primary : theme.textSecondary },
                ]}
              >
                {chat.time}
              </Text>
              {chat.unreadCount > 0 ? (
                <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.badgeText, { color: theme.surface }]}>
                    {chat.unreadCount}
                  </Text>
                </View>
              ) : (
                <View style={{ height: 18 }} />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchBar: {
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    padding: 0,
    fontSize: 14,
  },
  chatListContainer: {
    paddingBottom: 24,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  chatDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  chatName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 13,
    flex: 1,
  },
  chatMeta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

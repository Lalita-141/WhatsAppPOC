import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../../../core/theme';

interface StatusItem {
  id: string;
  name: string;
  time: string;
  hasUnread: boolean;
  avatar: string;
  avatarBg: string;
}

interface ChannelItem {
  id: string;
  name: string;
  logo: string;
  logoBg: string;
  preview: string;
  time: string;
  isVerified: boolean;
}

export const UpdatesTab: React.FC = () => {
  const { theme } = useTheme();

  const mockStatuses: StatusItem[] = [
    { id: '1', name: 'My Status', time: 'Tap to add status', hasUnread: false, avatar: '➕', avatarBg: '#8696A0' },
    { id: '2', name: 'John Doe', time: '12 minutes ago', hasUnread: true, avatar: 'JD', avatarBg: '#5C6BC0' },
    { id: '3', name: 'Alice Smith', time: '2 hours ago', hasUnread: true, avatar: 'AS', avatarBg: '#EC407A' },
    { id: '4', name: 'Bob Miller', time: 'Yesterday, 8:40 PM', hasUnread: false, avatar: 'BM', avatarBg: '#FFA726' },
  ];

  const mockChannels: ChannelItem[] = [
    {
      id: '1',
      name: 'WhatsApp',
      logo: '💬',
      logoBg: '#66BB6A',
      preview: 'Check out the new features rolling out to communities this week!',
      time: '10:15 AM',
      isVerified: true,
    },
    {
      id: '2',
      name: 'Tech News & Releases',
      logo: '💻',
      logoBg: '#26C6DA',
      preview: 'React Native 0.88 enters release candidate phase. See what is new.',
      time: 'Yesterday',
      isVerified: true,
    },
    {
      id: '3',
      name: 'Local Travel Club',
      logo: '✈️',
      logoBg: '#FF7043',
      preview: 'Explore the top destinations for your weekend getaways.',
      time: 'Aug 14',
      isVerified: false,
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Status Section */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Status</Text>
        <TouchableOpacity>
          <Text style={{ color: theme.primary, fontWeight: '700' }}>See all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statusScroll}
      >
        {mockStatuses.map((status) => (
          <TouchableOpacity key={status.id} style={styles.statusItem}>
            {/* Ring around avatar */}
            <View
              style={[
                styles.statusAvatarOuter,
                {
                  borderColor: status.hasUnread ? theme.primary : 'transparent',
                  borderWidth: status.hasUnread ? 2 : 0,
                },
              ]}
            >
              <View style={[styles.statusAvatar, { backgroundColor: status.avatarBg }]}>
                <Text style={styles.statusAvatarText}>{status.avatar}</Text>
              </View>
            </View>
            <Text style={[styles.statusName, { color: theme.text }]} numberOfLines={1}>
              {status.name}
            </Text>
            <Text style={[styles.statusTime, { color: theme.textSecondary }]} numberOfLines={1}>
              {status.time}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      {/* Channels Section */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Channels</Text>
        <TouchableOpacity>
          <Text style={{ color: theme.primary, fontWeight: '700' }}>Explore</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.channelsContainer}>
        {mockChannels.map((channel) => (
          <TouchableOpacity
            key={channel.id}
            style={[styles.channelItem, { borderBottomColor: theme.border }]}
          >
            {/* Logo */}
            <View style={[styles.channelLogo, { backgroundColor: channel.logoBg }]}>
              <Text style={styles.channelLogoText}>{channel.logo}</Text>
            </View>

            {/* Content */}
            <View style={styles.channelContent}>
              <View style={styles.channelHeaderRow}>
                <Text style={[styles.channelName, { color: theme.text }]} numberOfLines={1}>
                  {channel.name}
                  {channel.isVerified && <Text style={{ color: '#00E676', fontSize: 13 }}> ✓</Text>}
                </Text>
                <Text style={[styles.channelTime, { color: theme.textSecondary }]}>
                  {channel.time}
                </Text>
              </View>
              <Text style={[styles.channelPreview, { color: theme.textSecondary }]} numberOfLines={2}>
                {channel.preview}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  statusScroll: {
    paddingHorizontal: 16,
    gap: 16,
    paddingBottom: 8,
  },
  statusItem: {
    width: 72,
    alignItems: 'center',
  },
  statusAvatarOuter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    marginBottom: 6,
  },
  statusAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  statusName: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  statusTime: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
    width: '100%',
  },
  divider: {
    height: 8,
    marginVertical: 16,
  },
  channelsContainer: {
    paddingHorizontal: 16,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  channelLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  channelLogoText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  channelContent: {
    flex: 1,
  },
  channelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  channelName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  channelTime: {
    fontSize: 11,
    marginLeft: 8,
  },
  channelPreview: {
    fontSize: 13,
    lineHeight: 18,
  },
});

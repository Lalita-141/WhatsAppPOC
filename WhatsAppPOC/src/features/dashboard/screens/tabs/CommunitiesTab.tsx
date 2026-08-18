import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../../../core/theme';

export const CommunitiesTab: React.FC = () => {
  const { theme } = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Community Banner Card */}
      <View style={[styles.bannerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.illustration, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={styles.bannerEmoji}>👥</Text>
        </View>
        <Text style={[styles.bannerTitle, { color: theme.text }]}>Stay connected with communities</Text>
        <Text style={[styles.bannerDescription, { color: theme.textSecondary }]}>
          Communities bring members together in topic-based groups, making it easy to send announcements and stay organized.
        </Text>
        
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.primary }]}>
          <Text style={[styles.actionButtonText, { color: theme.surface }]}>New Community</Text>
        </TouchableOpacity>
      </View>

      {/* Community Item List */}
      <View style={styles.communityList}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Your Communities</Text>
        
        <View style={[styles.communityItem, { borderBottomColor: theme.border }]}>
          <View style={styles.communityAvatar}>
            <Text style={styles.communityAvatarText}>💻</Text>
          </View>
          <View style={styles.communityInfo}>
            <Text style={[styles.communityName, { color: theme.text }]}>Enterprise Chat POC</Text>
            <Text style={[styles.communitySubText, { color: theme.textSecondary }]} numberOfLines={1}>
              Announcements, Frontend & Backend Syncs
            </Text>
          </View>
        </View>

        {/* Subgroups of this Community */}
        <TouchableOpacity style={styles.subgroupRow}>
          <View style={[styles.subgroupIcon, { backgroundColor: theme.surface }]}>
            <Text style={{ fontSize: 14 }}>📢</Text>
          </View>
          <View style={styles.subgroupInfo}>
            <Text style={[styles.subgroupName, { color: theme.text }]}>Announcements</Text>
            <Text style={[styles.subgroupPreview, { color: theme.textSecondary }]} numberOfLines={1}>
              System: Welcome everyone! The backend port is now 5001.
            </Text>
          </View>
          <Text style={[styles.subgroupTime, { color: theme.textSecondary }]}>Yesterday</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.subgroupRow}>
          <View style={[styles.subgroupIcon, { backgroundColor: theme.surface }]}>
            <Text style={{ fontSize: 14 }}>💬</Text>
          </View>
          <View style={styles.subgroupInfo}>
            <Text style={[styles.subgroupName, { color: theme.text }]}>Frontend Developers</Text>
            <Text style={[styles.subgroupPreview, { color: theme.textSecondary }]} numberOfLines={1}>
              John: Hooked up the new useTheme configuration.
            </Text>
          </View>
          <Text style={[styles.subgroupTime, { color: theme.textSecondary }]}>11:15 AM</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  bannerCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  illustration: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  bannerEmoji: {
    fontSize: 44,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  bannerDescription: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  communityList: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  communityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  communityAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  communityAvatarText: {
    color: '#FFFFFF',
    fontSize: 20,
  },
  communityInfo: {
    flex: 1,
  },
  communityName: {
    fontSize: 15,
    fontWeight: '700',
  },
  communitySubText: {
    fontSize: 12,
    marginTop: 2,
  },
  subgroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 32,
  },
  subgroupIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  subgroupInfo: {
    flex: 1,
  },
  subgroupName: {
    fontSize: 14,
    fontWeight: '700',
  },
  subgroupPreview: {
    fontSize: 12,
    marginTop: 2,
  },
  subgroupTime: {
    fontSize: 10,
    marginLeft: 8,
  },
});

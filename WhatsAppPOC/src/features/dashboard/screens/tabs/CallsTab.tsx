import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../../../core/theme';

interface CallItem {
  id: string;
  name: string;
  time: string;
  type: 'voice' | 'video';
  status: 'incoming' | 'outgoing' | 'missed';
  avatar: string;
  avatarBg: string;
}

export const CallsTab: React.FC = () => {
  const { theme } = useTheme();

  const mockCalls: CallItem[] = [
    {
      id: '1',
      name: 'John Doe',
      time: 'Today, 11:20 AM',
      type: 'voice',
      status: 'incoming',
      avatar: 'JD',
      avatarBg: '#5C6BC0',
    },
    {
      id: '2',
      name: 'Alice Smith',
      time: 'Yesterday, 6:40 PM',
      type: 'video',
      status: 'missed',
      avatar: 'AS',
      avatarBg: '#EC407A',
    },
    {
      id: '3',
      name: 'React Native Team 🚀',
      time: 'August 15, 3:00 PM',
      type: 'voice',
      status: 'outgoing',
      avatar: 'RN',
      avatarBg: '#26A69A',
    },
    {
      id: '4',
      name: 'Bob Miller',
      time: 'August 12, 10:15 AM',
      type: 'voice',
      status: 'missed',
      avatar: 'BM',
      avatarBg: '#FFA726',
    },
  ];

  const renderStatusArrow = (status: CallItem['status']) => {
    switch (status) {
      case 'incoming':
        return <Text style={{ color: theme.success, fontSize: 13, marginRight: 4 }}>↙</Text>;
      case 'outgoing':
        return <Text style={{ color: theme.primary, fontSize: 13, marginRight: 4 }}>↗</Text>;
      case 'missed':
        return <Text style={{ color: theme.error, fontSize: 13, marginRight: 4 }}>↙</Text>;
      default:
        return null;
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent</Text>

      <View style={styles.callList}>
        {mockCalls.map((call) => (
          <TouchableOpacity
            key={call.id}
            style={[styles.callItem, { borderBottomColor: theme.border }]}
          >
            {/* Avatar */}
            <View style={[styles.avatar, { backgroundColor: call.avatarBg }]}>
              <Text style={styles.avatarText}>{call.avatar}</Text>
            </View>

            {/* Details */}
            <View style={styles.callDetails}>
              <Text
                style={[
                  styles.callName,
                  { color: call.status === 'missed' ? theme.error : theme.text },
                ]}
                numberOfLines={1}
              >
                {call.name}
              </Text>
              <View style={styles.statusRow}>
                {renderStatusArrow(call.status)}
                <Text style={[styles.timeText, { color: theme.textSecondary }]}>
                  {call.time}
                </Text>
              </View>
            </View>

            {/* Call Icon Button */}
            <TouchableOpacity style={styles.iconButton}>
              <Text style={{ fontSize: 20, color: theme.primary }}>
                {call.type === 'video' ? '📹' : '📞'}
              </Text>
            </TouchableOpacity>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  callList: {
    paddingHorizontal: 16,
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  callDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  callName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
  },
  iconButton: {
    padding: 8,
    marginLeft: 8,
  },
});

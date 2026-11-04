import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../../core/theme';
import { StatusSection } from '../../../updates/screens/StatusSection';
import { ChannelsSection } from '../../../updates/screens/ChannelsSection';
import { AnnouncementsTab } from '../../../broadcast/screens/AnnouncementsTab';

type Section = 'status' | 'channels' | 'announcements';

interface Props {
  accessToken: string;
  unreadAnnouncements: number;
  onUnreadAnnouncementsChange: (count: number) => void;
  initialSection?: Section;
}

/** Status updates, followed channels and organization announcements. */
export const UpdatesTab: React.FC<Props> = ({ accessToken, unreadAnnouncements, onUnreadAnnouncementsChange, initialSection = 'status' }) => {
  const { theme } = useTheme();
  const [section, setSection] = useState<Section>(initialSection);
  const labels: Record<Section, string> = {
    status: 'Status',
    channels: 'Channels',
    announcements: unreadAnnouncements ? `Announcements (${unreadAnnouncements})` : 'Announcements',
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.segment}>
        {(Object.keys(labels) as Section[]).map((key) => (
          <TouchableOpacity
            key={key}
            onPress={() => setSection(key)}
            style={[styles.chip, { backgroundColor: section === key ? theme.primary : theme.surface }]}
            accessibilityState={{ selected: section === key }}
          >
            <Text style={{ color: section === key ? theme.surface : theme.text, fontWeight: '600', fontSize: 13 }}>{labels[key]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {section === 'status' && <StatusSection accessToken={accessToken} />}
      {section === 'channels' && <ChannelsSection accessToken={accessToken} />}
      {section === 'announcements' && <AnnouncementsTab accessToken={accessToken} onUnreadChange={onUnreadAnnouncementsChange} />}
    </View>
  );
};

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
});

import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { Avatar } from '../../../components/media/Avatar';

export interface ProfileAction {
  label: string;
  onPress: () => void;
  danger?: boolean;
}

interface Props {
  visible: boolean;
  name: string;
  mobileNo?: string;
  about?: string | null;
  profilePhotoMediaId?: string | null;
  subtitle?: string;
  actions: ProfileAction[];
  onClose: () => void;
}

/** A contact's profile: photo, about and phone as their privacy allows, and actions. */
export const ContactProfileModal: React.FC<Props> = ({ visible, name, mobileNo, about, profilePhotoMediaId, subtitle, actions, onClose }) => {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
            <Text style={{ color: theme.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 17, marginLeft: 12 }}>Contact info</Text>
        </View>
        <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 24, gap: 6 }}>
          <Avatar name={name} mediaId={profilePhotoMediaId} size={120} />
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', marginTop: 12 }}>{name}</Text>
          {mobileNo ? <Text style={{ color: theme.textSecondary }}>{mobileNo}</Text> : null}
          {subtitle ? <Text style={{ color: theme.textSecondary }}>{subtitle}</Text> : null}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>About</Text>
            <Text style={{ color: theme.text, marginTop: 2 }}>{about || 'Not shared'}</Text>
          </View>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, paddingVertical: 0 }]}>
            {actions.map((action, index) => (
              <TouchableOpacity
                key={action.label}
                style={[styles.action, index < actions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
              >
                <Text style={{ color: action.danger ? theme.error : theme.text, fontSize: 16 }}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  card: { width: '100%', borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 16 },
  action: { paddingVertical: 14 },
});

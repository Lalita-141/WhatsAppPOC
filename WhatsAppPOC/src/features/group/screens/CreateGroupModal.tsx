import React, { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { RegisteredContact } from '../../contacts/hooks/useContactSync';
import * as api from '../api/groupApi';
import { MemberPicker } from './MemberPicker';

interface Props {
  visible: boolean;
  accessToken: string;
  contacts: RegisteredContact[];
  onClose: () => void;
  onCreated: (group: api.GroupInfo) => void;
}

export const CreateGroupModal: React.FC<Props> = ({ visible, accessToken, contacts, onClose, onCreated }) => {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const close = () => {
    setName('');
    setSelected([]);
    onClose();
  };

  const create = async () => {
    setIsSaving(true);
    try {
      const group = await api.createGroup(accessToken, name.trim(), selected);
      close();
      onCreated(group);
    } catch (err: any) {
      Alert.alert('Could not create group', err?.message || 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={close}>
            <Text style={{ color: theme.primary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>New group</Text>
          <TouchableOpacity onPress={create} disabled={!name.trim() || isSaving}>
            <Text style={{ color: name.trim() ? theme.primary : theme.textSecondary, fontSize: 16, fontWeight: '700' }}>
              {isSaving ? 'Creating…' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={name}
          onChangeText={setName}
          placeholder="Group name"
          placeholderTextColor={theme.placeholder}
          maxLength={150}
        />
        <Text style={{ color: theme.textSecondary, paddingHorizontal: 16, paddingBottom: 6 }}>Add members ({selected.length})</Text>
        <MemberPicker
          contacts={contacts}
          selected={selected}
          onToggle={(id) => setSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))}
        />
      </View>
    </Modal>
  );
};

/** Joins a group with the code an admin shared. */
export const JoinGroupModal: React.FC<{ visible: boolean; accessToken: string; onClose: () => void; onJoined: (group: api.GroupInfo) => void }> = ({
  visible,
  accessToken,
  onClose,
  onJoined,
}) => {
  const { theme } = useTheme();
  const [code, setCode] = useState('');

  const join = async () => {
    try {
      const group = await api.joinGroup(accessToken, code.trim());
      setCode('');
      onClose();
      onJoined(group);
    } catch (err: any) {
      Alert.alert('Could not join', err?.message || 'Check the code and try again.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.dialog, { backgroundColor: theme.surface }]}>
          <Text style={[styles.title, { color: theme.text, marginBottom: 12 }]}>Join a group</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, margin: 0 }]}
            value={code}
            onChangeText={setCode}
            placeholder="Invite code"
            placeholderTextColor={theme.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 16 }}>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={join} disabled={!code.trim()}>
              <Text style={{ color: code.trim() ? theme.primary : theme.textSecondary, fontWeight: '700' }}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16, margin: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: 14, padding: 20 },
});

import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { RegisteredContact } from '../../contacts/hooks/useContactSync';

interface Props {
  contacts: RegisteredContact[];
  excludeIds?: string[];
  selected: string[];
  onToggle: (userOrganizationId: string) => void;
}

/** Registered phone contacts the user can add to a group. */
export const MemberPicker: React.FC<Props> = ({ contacts, excludeIds = [], selected, onToggle }) => {
  const { theme } = useTheme();
  const options = contacts.filter((c) => c.userOrganizationId && !excludeIds.includes(c.userOrganizationId));

  if (options.length === 0) {
    return (
      <Text style={{ color: theme.textSecondary, padding: 16 }}>
        No contacts to add. People appear here once they are in your phone contacts and registered in an organization you can reach.
      </Text>
    );
  }

  return (
    <FlatList
      data={options}
      keyExtractor={(item) => item.userOrganizationId}
      renderItem={({ item }) => {
        const isOn = selected.includes(item.userOrganizationId);
        return (
          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => onToggle(item.userOrganizationId)} accessibilityState={{ selected: isOn }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 16 }}>{item.name || item.phone}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{item.phone}</Text>
            </View>
            <Text style={{ color: isOn ? theme.primary : theme.textSecondary, fontSize: 18 }}>{isOn ? '☑' : '☐'}</Text>
          </TouchableOpacity>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});

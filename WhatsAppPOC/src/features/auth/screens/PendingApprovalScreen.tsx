import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../../core/theme';

/** Shown after sign-up when an organization admin still has to approve the request. */
export const PendingApprovalScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const organizationName: string | undefined = route.params?.organizationName;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={styles.icon}>⏳</Text>
      <Text style={[styles.title, { color: theme.text }]}>Waiting for approval</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        Your request to join {organizationName || 'the organization'} was sent to its admins. Once an admin
        approves it, log in again with your phone number.
      </Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        If an admin invites your number instead, you can log in straight away.
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'login' }] })}
      >
        <Text style={[styles.buttonText, { color: theme.surface }]}>Back to login</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 12 },
  button: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  buttonText: { fontSize: 16, fontWeight: '700' },
});

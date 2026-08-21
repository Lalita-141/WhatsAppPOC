import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../core/theme';
import { useAuthStore } from '../store/authStore';

export const OrganizationSetupScreen: React.FC = () => {
  const navigation = useNavigation();
  const {
    accessToken: token,
    mobileNo,
    handleOrganizationSetupSave,
    handleBackToLogin,
    isLoading,
    errorMessage,
  } = useAuthStore();
  const { theme } = useTheme();
  const [orgCode, setOrgCode] = useState('');
  const [isTokenOpen, setIsTokenOpen] = useState(false);

  const handleSave = () => {
    if (!orgCode.trim()) {
      return;
    }
    handleOrganizationSetupSave(orgCode.trim().toUpperCase(), navigation);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Top Header */}
        <View style={styles.topContainer}>
          <Text style={[styles.title, { color: theme.primary }]}>Organization Setup</Text>
          <Text style={[styles.subtitle, { color: theme.text }]}>Link your profile with your organization</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {/* Read Only Auto-collected Info */}
          <Text style={[styles.sectionHeader, { color: theme.primary }]}>ACCOUNT DETAILS</Text>
          
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>MOBILE NUMBER</Text>
          <TextInput
            style={[styles.input, styles.readOnlyInput, { color: theme.textSecondary, backgroundColor: theme.surface, borderColor: theme.border }]}
            value={mobileNo}
            editable={false}
          />

          {/* Editable Fields */}
          <Text style={[styles.sectionHeader, { color: theme.primary, marginTop: 24 }]}>ASSOCIATION SETTINGS</Text>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>ORGANIZATION CODE *</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            value={orgCode}
            onChangeText={setOrgCode}
            placeholder="Enter Organization Code (e.g. HNT001)"
            placeholderTextColor={theme.placeholder}
            autoCapitalize="characters"
            maxLength={100}
          />

          {/* Collapsible Token Section */}
          {token && (
            <View style={{ marginTop: 16 }}>
              <TouchableOpacity onPress={() => setIsTokenOpen(!isTokenOpen)}>
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
                  {isTokenOpen ? '▼ Hide Verification Token' : '▶ Show Verification Token'}
                </Text>
              </TouchableOpacity>
              {isTokenOpen && (
                <View style={[styles.tokenBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <Text style={[styles.tokenLabel, { color: theme.textSecondary }]}>JWT Organization Setup Token</Text>
                  <Text numberOfLines={3} ellipsizeMode="tail" style={[styles.tokenText, { color: theme.text, backgroundColor: theme.background }]}>
                    {token}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Error Message */}
          {errorMessage && (
            <View style={[styles.errorContainer, { backgroundColor: theme.surface, borderColor: theme.error }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.primary }, !orgCode.trim() && styles.disabledButton]}
              onPress={handleSave}
              disabled={isLoading || !orgCode.trim()}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.surface} />
              ) : (
                <Text style={[styles.submitButtonText, { color: theme.surface }]}>Link Organization</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: theme.border }]}
              onPress={() => handleBackToLogin(navigation)}
              disabled={isLoading}
            >
              <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 48,
    flexGrow: 1,
  },
  topContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  formContainer: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  readOnlyInput: {
    opacity: 0.7,
  },
  tokenBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  tokenLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  tokenText: {
    fontSize: 10,
    padding: 6,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  errorContainer: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  buttonContainer: {
    marginTop: 24,
    gap: 12,
  },
  submitButton: {
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
  cancelButton: {
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

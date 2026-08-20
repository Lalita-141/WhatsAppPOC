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
import { useTheme } from '../../../core/theme';

interface ProfileSetupScreenProps {
  token: string;
  orgCode: string;
  countryCode: string;
  countryId: string;
  mobileNo: string;
  onSaveProfile: (firstName: string, lastName: string, about: string) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  errorMessage: string | null;
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  token,
  orgCode,
  countryCode,
  countryId,
  mobileNo,
  onSaveProfile,
  onCancel,
  isLoading,
  errorMessage,
}) => {
  const { theme } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [about, setAbout] = useState('Hey there! I am using WhatsAppPOC.');
  const [isTokenOpen, setIsTokenOpen] = useState(false);

  const handleSave = () => {
    if (!firstName.trim()) {
      return;
    }
    onSaveProfile(firstName, lastName, about);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Top Header */}
        <View style={styles.topContainer}>
          <Text style={[styles.title, { color: theme.primary }]}>Profile Info</Text>
          <Text style={[styles.subtitle, { color: theme.text }]}>Please provide your name and details</Text>
        </View>

        {/* Profile Picture Placeholder */}
        <View style={styles.avatarContainer}>
          <View style={[styles.avatarCircle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={styles.avatarIcon}>📷</Text>
          </View>
          <Text style={[styles.avatarLabel, { color: theme.primary }]}>ADD PHOTO</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {/* Read Only Auto-collected Info */}
          <Text style={[styles.sectionHeader, { color: theme.primary }]}>AUTO-COLLECTED DETAILS</Text>
          
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>ORG ID / CODE</Text>
              <TextInput
                style={[styles.input, styles.readOnlyInput, { color: theme.textSecondary, backgroundColor: theme.surface, borderColor: theme.border }]}
                value={orgCode}
                editable={false}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>COUNTRY CODE</Text>
              <TextInput
                style={[styles.input, styles.readOnlyInput, { color: theme.textSecondary, backgroundColor: theme.surface, borderColor: theme.border }]}
                value={countryCode}
                editable={false}
              />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>MOBILE NUMBER</Text>
          <TextInput
            style={[styles.input, styles.readOnlyInput, { color: theme.textSecondary, backgroundColor: theme.surface, borderColor: theme.border }]}
            value={mobileNo}
            editable={false}
          />

          {/* Editable Fields */}
          <Text style={[styles.sectionHeader, { color: theme.primary, marginTop: 24 }]}>YOUR PROFILE</Text>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>FIRST NAME *</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First Name (Required)"
            placeholderTextColor={theme.placeholder}
            maxLength={100}
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>LAST NAME (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last Name"
            placeholderTextColor={theme.placeholder}
            maxLength={100}
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>ABOUT (STATUS BIO)</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
            value={about}
            onChangeText={setAbout}
            placeholder="Tell us about yourself..."
            placeholderTextColor={theme.placeholder}
            multiline
            numberOfLines={3}
            maxLength={500}
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
                  <Text style={[styles.tokenLabel, { color: theme.textSecondary }]}>JWT Profile Token</Text>
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
              style={[styles.submitButton, { backgroundColor: theme.primary }, !firstName.trim() && styles.disabledButton]}
              onPress={handleSave}
              disabled={isLoading || !firstName.trim()}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.surface} />
              ) : (
                <Text style={[styles.submitButtonText, { color: theme.surface }]}>Save Profile</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: theme.border }]}
              onPress={onCancel}
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
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarIcon: {
    fontSize: 28,
  },
  avatarLabel: {
    fontSize: 12,
    fontWeight: '700',
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  textArea: {
    height: 80,
    paddingVertical: 12,
    textAlignVertical: 'top',
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

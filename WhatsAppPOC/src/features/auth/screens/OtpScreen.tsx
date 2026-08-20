import React, { useState, useRef } from 'react';
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

interface OtpScreenProps {
  mobileNo: string;
  countryCode: string;
  otp: string;
  setOtp: (val: string) => void;
  onVerifyOtp: () => Promise<void>;
  onResendOtp: () => Promise<void>;
  onBack: () => void;
  isLoading: boolean;
  errorMessage: string | null;
  serverOtpHint?: string | null; // Display the OTP returned by server for easy testing
}

export const OtpScreen: React.FC<OtpScreenProps> = ({
  mobileNo,
  countryCode,
  otp,
  setOtp,
  onVerifyOtp,
  onResendOtp,
  onBack,
  isLoading,
  errorMessage,
  serverOtpHint,
}) => {
  const { theme } = useTheme();
  const inputRef = useRef<any>(null);

  const handleOtpChange = (text: string) => {
    // Only allow numbers
    const cleanText = text.replace(/[^0-9]/g, '');
    setOtp(cleanText);
  };

  const handleBoxPress = () => {
    inputRef.current?.focus();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Top Header */}
        <View style={styles.topContainer}>
          <Text style={[styles.title, { color: theme.primary }]}>Verifying your number</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Waiting to automatically detect an SMS sent to{' '}
            <Text style={{ color: theme.text, fontWeight: '700' }}>
              {countryCode} {mobileNo}
            </Text>
            .
          </Text>
          <TouchableOpacity onPress={onBack}>
            <Text style={[styles.linkText, { color: theme.primary }]}>Wrong number?</Text>
          </TouchableOpacity>
        </View>

        {/* Custom 4-Box OTP UI */}
        <View style={styles.otpOuterContainer}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBoxPress}
            style={styles.otpGrid}
          >
            {Array(4)
              .fill(0)
              .map((_, idx) => {
                const digit = otp[idx] || '';
                const isFocused = otp.length === idx;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.otpBox,
                      {
                        backgroundColor: theme.surface,
                        borderColor: isFocused ? theme.primary : theme.border,
                        borderBottomWidth: isFocused ? 3 : 1.5,
                      },
                    ]}
                  >
                    <Text style={[styles.otpDigit, { color: theme.text }]}>{digit}</Text>
                  </View>
                );
              })}
          </TouchableOpacity>

          {/* Hidden input to receive focus */}
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={otp}
            onChangeText={handleOtpChange}
            maxLength={4}
            keyboardType="number-pad"
            autoFocus
          />
        </View>

        {/* Server OTP Hint for Testing */}
        {serverOtpHint && (
          <View style={[styles.hintContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.hintText, { color: theme.primary }]}>
              🔧 Test OTP Helper: <Text style={{ fontWeight: 'bold' }}>{serverOtpHint}</Text>
            </Text>
          </View>
        )}

        {/* Action Controls */}
        <View style={styles.actionContainer}>
          {errorMessage && (
            <View style={[styles.errorContainer, { backgroundColor: theme.surface, borderColor: theme.error }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: theme.primary }]}
            onPress={onVerifyOtp}
            disabled={isLoading || otp.length < 4}
          >
            {isLoading ? (
              <ActivityIndicator color={theme.surface} />
            ) : (
              <Text style={[styles.submitButtonText, { color: theme.surface }]}>Verify OTP</Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={{ color: theme.textSecondary }}>Didn't receive code?</Text>
            <TouchableOpacity onPress={onResendOtp}>
              <Text style={[styles.resendLink, { color: theme.primary }]}> Resend OTP</Text>
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
    justifyContent: 'space-between',
  },
  topContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  otpOuterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  otpGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  otpBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: {
    fontSize: 24,
    fontWeight: '700',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  hintContainer: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginVertical: 12,
  },
  hintText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionContainer: {
    marginBottom: 24,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
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
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  resendLink: {
    fontWeight: '700',
  },
});

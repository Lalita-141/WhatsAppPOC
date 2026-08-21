import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../core/theme';
import { Country, getCountries } from '../services/authApi';
import { useAuthStore } from '../store/authStore';

// Fail-safe default country list in case the backend is offline or empty
const OFFLINE_FALLBACK_COUNTRIES: Country[] = [
  { countryId: '1', countryName: 'India', countryCode: '+91', isoCode: 'IN', iso3Code: 'IND', flag: '🇮🇳' },
  { countryId: '2', countryName: 'United States', countryCode: '+1', isoCode: 'US', iso3Code: 'USA', flag: '🇺🇸' },
  { countryId: '3', countryName: 'United Kingdom', countryCode: '+44', isoCode: 'GB', iso3Code: 'GBR', flag: '🇬🇧' },
  { countryId: '4', countryName: 'United Arab Emirates', countryCode: '+971', isoCode: 'AE', iso3Code: 'ARE', flag: '🇦🇪' },
  { countryId: '5', countryName: 'Singapore', countryCode: '+65', isoCode: 'SG', iso3Code: 'SGP', flag: '🇸🇬' },
];

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation();
  const {
    apiBaseUrl,
    orgCode,
    setOrgCode,
    mobileNo,
    setMobileNo,
    selectedCountry,
    setSelectedCountry,
    customIp,
    setCustomIp,
    handleSendOtp,
    isLoading,
    errorMessage,
  } = useAuthStore();
  const { theme } = useTheme();
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [countries, setCountries] = useState<Country[]>(OFFLINE_FALLBACK_COUNTRIES);
  const [isCountryModalVisible, setIsCountryModalVisible] = useState(false);
  const [isDevSettingsOpen, setIsDevSettingsOpen] = useState(false);
  const [isFetchingCountries, setIsFetchingCountries] = useState(false);

  // Fetch countries dynamically from backend
  useEffect(() => {
    const fetchCountries = async () => {
      setIsFetchingCountries(true);
      try {
        const fetched = await getCountries(apiBaseUrl);
        if (fetched && fetched.length > 0) {
          setCountries(fetched);
          // Set default country if none selected
          if (!selectedCountry) {
            setSelectedCountry(fetched[0]);
          }
        }
      } catch (err) {
        console.warn('Could not fetch countries from server, using offline fallbacks:', err);
        setCountries(OFFLINE_FALLBACK_COUNTRIES);
        if (!selectedCountry) {
          setSelectedCountry(OFFLINE_FALLBACK_COUNTRIES[0]);
        }
      } finally {
        setIsFetchingCountries(false);
      }
    };

    fetchCountries();
  }, [apiBaseUrl]);

  const filteredCountries = countries.filter((c) => {
    const query = countrySearchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      c.countryName.toLowerCase().includes(query) ||
      c.countryCode.toLowerCase().includes(query) ||
      (c.isoCode && c.isoCode.toLowerCase().includes(query)) ||
      (c.iso3Code && c.iso3Code.toLowerCase().includes(query))
    );
  });

  const selectCountry = (country: Country) => {
    setSelectedCountry(country);
    setIsCountryModalVisible(false);
    setCountrySearchQuery('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Logo and Greeting */}
        <View style={styles.topContainer}>
          <Text style={[styles.title, { color: theme.primary }]}>WhatsAppPOC</Text>
          <Text style={[styles.subtitle, { color: theme.text }]}>Verify your phone number</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            WhatsAppPOC will send a 4-digit verification code to your device.
          </Text>
        </View>

        {/* Input Fields */}
        <View style={styles.formContainer}>
          {/* Org Code Input */}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>ORGANIZATION CODE</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
            value={orgCode}
            onChangeText={setOrgCode}
            placeholder="Enter Org Code (e.g. DEFAULT)"
            placeholderTextColor={theme.placeholder}
            autoCapitalize="characters"
          />

          {/* Country Selection */}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>COUNTRY</Text>
          <TouchableOpacity
            style={[
              styles.countrySelector,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
            onPress={() => setIsCountryModalVisible(true)}
          >
            <Text style={[styles.countryText, { color: selectedCountry ? theme.text : theme.placeholder }]}>
              {selectedCountry
                ? `${selectedCountry.flag || ''} ${selectedCountry.countryName} (${selectedCountry.countryCode})`
                : 'Select Country'}
            </Text>
            {isFetchingCountries ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={{ color: theme.textSecondary, fontSize: 16 }}>▼</Text>
            )}
          </TouchableOpacity>

          {/* Mobile Number Input */}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>PHONE NUMBER</Text>
          <View style={styles.phoneInputContainer}>
            <View
              style={[
                styles.countryCodeBox,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: '600' }}>
                {selectedCountry ? selectedCountry.countryCode : '+'}
              </Text>
            </View>
            <TextInput
              style={[
                styles.phoneInput,
                {
                  color: theme.text,
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  flex: 1,
                },
              ]}
              value={mobileNo}
              onChangeText={setMobileNo}
              placeholder="Mobile Number"
              placeholderTextColor={theme.placeholder}
              keyboardType="phone-pad"
              maxLength={15}
            />
          </View>

          {/* Error Message */}
          {errorMessage && (
            <View style={[styles.errorContainer, { backgroundColor: theme.surface, borderColor: theme.error }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: theme.primary }]}
            onPress={() => handleSendOtp(navigation)}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={theme.surface} />
            ) : (
              <Text style={[styles.submitButtonText, { color: theme.surface }]}>Send OTP</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Developer Settings Toggle */}
        <View style={styles.devSettingsContainer}>
          <TouchableOpacity
            onPress={() => setIsDevSettingsOpen(!isDevSettingsOpen)}
            style={styles.devSettingsHeader}
          >
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
              {isDevSettingsOpen ? '▼ Hide Developer Settings' : '▶ Show Developer Settings'}
            </Text>
          </TouchableOpacity>
          {isDevSettingsOpen && (
            <View style={[styles.devSettingsBody, { borderColor: theme.border }]}>
              <Text style={[styles.devSettingsLabel, { color: theme.textSecondary }]}>
                Backend Host IP (For Physical Device Testing)
              </Text>
              <TextInput
                style={[
                  styles.devInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                value={customIp}
                onChangeText={setCustomIp}
                placeholder="e.g. 192.168.1.50 (leave empty for default)"
                placeholderTextColor={theme.placeholder}
                keyboardType="numeric"
              />
              <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 4 }}>
                Current API Endpoint: {apiBaseUrl}
              </Text>
            </View>
          )}
        </View>

        {/* Country Picker Modal */}
        <Modal
          visible={isCountryModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => {
            setIsCountryModalVisible(false);
            setCountrySearchQuery('');
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Choose a Country</Text>
                <TouchableOpacity
                  onPress={() => {
                    setIsCountryModalVisible(false);
                    setCountrySearchQuery('');
                  }}
                >
                  <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }}>Close</Text>
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View style={styles.modalSearchContainer}>
                <View
                  style={[
                    styles.modalSearchBar,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text style={{ color: theme.placeholder, fontSize: 14, marginRight: 8 }}>🔍</Text>
                  <TextInput
                    style={[styles.modalSearchInput, { color: theme.text }]}
                    value={countrySearchQuery}
                    onChangeText={setCountrySearchQuery}
                    placeholder="Search country or code..."
                    placeholderTextColor={theme.placeholder}
                    autoCorrect={false}
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                  />
                  {countrySearchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setCountrySearchQuery('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ color: theme.placeholder, fontSize: 14, fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <FlatList
                data={filteredCountries}
                keyExtractor={(item) => item.countryId}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.countryItem, { borderBottomColor: theme.border }]}
                    onPress={() => selectCountry(item)}
                  >
                    <Text style={styles.countryItemFlag}>{item.flag || '🏳️'}</Text>
                    <Text style={[styles.countryItemName, { color: theme.text }]}>
                      {item.countryName}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>{item.countryCode}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                      No country found matching "{countrySearchQuery}"
                    </Text>
                  </View>
                }
              />
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  countrySelector: {
    height: 52,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  countryText: {
    fontSize: 16,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCodeBox: {
    height: 52,
    width: 65,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneInput: {
    height: 52,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
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
  submitButton: {
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  devSettingsContainer: {
    marginTop: 16,
  },
  devSettingsHeader: {
    alignSelf: 'center',
    padding: 8,
  },
  devSettingsBody: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 8,
  },
  devSettingsLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  devInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSearchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalSearchBar: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  modalSearchInput: {
    flex: 1,
    height: '100%',
    padding: 0,
    fontSize: 15,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  countryItemFlag: {
    fontSize: 22,
    marginRight: 16,
  },
  countryItemName: {
    flex: 1,
    fontSize: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});

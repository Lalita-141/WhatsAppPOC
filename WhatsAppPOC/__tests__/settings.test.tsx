import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { SettingsTab } from '../src/features/settings/screens/SettingsTab';
import * as api from '../src/features/settings/api/settingsApi';
import { useAuthStore } from '../src/features/auth/store/authStore';

const mockNavigation = { reset: jest.fn() };

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

jest.mock('../src/core/theme', () => ({
  useTheme: () => ({
    theme: new Proxy({}, { get: () => '#000000' }),
    themeMode: 'system',
    setThemeMode: jest.fn(),
  }),
}));

jest.mock('../src/features/settings/api/settingsApi', () => ({
  getProfile: jest.fn(),
  getOrganizations: jest.fn(),
  getSessions: jest.fn(),
  getPrivacySettings: jest.fn(),
  getNotificationSettings: jest.fn(async () => ({ messages: true, groups: true, announcements: true, calls: true, showPreview: true })),
  updateNotificationSettings: jest.fn(),
  switchOrganization: jest.fn(),
  revokeSession: jest.fn(),
  logoutAllDevices: jest.fn(),
  updatePrivacySettings: jest.fn(),
  updateProfile: jest.fn(),
  deleteAccount: jest.fn(),
}));

jest.mock('../src/features/chat/api/chatApi', () => ({
  getBlockedUsers: jest.fn(async () => []),
  unblockUser: jest.fn(),
  getStarredMessages: jest.fn(async () => ({ messages: [] })),
  setStarred: jest.fn(),
}));

const mocked = api as jest.Mocked<typeof api>;

const render = async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<SettingsTab accessToken="token" />);
  });
  return renderer;
};

const press = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const button = renderer.root
    .findAllByType(TouchableOpacity)
    .find((node) => node.findAllByType(Text).some((text) => text.props.children === label));
  if (!button) throw new Error(`No button "${label}"`);
  await act(async () => {
    await button.props.onPress();
  });
};

const confirmAlert = async (buttonText: string) => {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2];
  await act(async () => {
    await buttons.find((b: any) => b.text === buttonText).onPress();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.getProfile.mockResolvedValue({ userId: '1', firstName: 'Asha', mobileNo: '9000000000' });
  mocked.getOrganizations.mockResolvedValue([
    { userOrganizationId: '7', organizationId: '1', orgCode: 'ORGA', organizationName: 'Org A', isCurrent: true },
    { userOrganizationId: '8', organizationId: '2', orgCode: 'ORGB', organizationName: 'Org B', isCurrent: false },
  ]);
  mocked.getSessions.mockResolvedValue([
    { sessionId: '1', deviceName: 'This phone', createdAt: '', lastUsedAt: '', isCurrent: true },
    { sessionId: '2', deviceName: 'Old tablet', createdAt: '', lastUsedAt: '', isCurrent: false },
  ]);
  mocked.getPrivacySettings.mockResolvedValue({
    aboutPrivacy: 'EVERYONE',
    profilePrivacy: 'CONTACTS',
    lastSeenPrivacy: 'EVERYONE',
    statusPrivacy: 'CONTACTS',
    readReceipts: true,
    typingIndicator: true,
  });
});

jest.mock('../src/features/admin/screens/OrganizationAdminScreen', () => ({
  OrganizationAdminScreen: () => null,
}));

describe('settings', () => {
  it('shows organization admin only to admins of the current organization', async () => {
    const asMember = await render();
    expect(asMember.root.findAllByType(Text).some((t) => String(t.props.children).includes('Organization admin'))).toBe(false);

    mocked.getOrganizations.mockResolvedValue([
      { userOrganizationId: '7', organizationId: '1', orgCode: 'ORGA', organizationName: 'Org A', isCurrent: true, role: 'ADMIN' },
    ]);
    const asAdmin = await render();
    expect(asAdmin.root.findAllByType(Text).some((t) => String(t.props.children).includes('Organization admin'))).toBe(true);
  });

  it('switches organization and restarts on the new session', async () => {
    mocked.switchOrganization.mockResolvedValue({
      token: 'new-access',
      refreshToken: 'new-refresh',
      userOrganizationId: '8',
      organizationId: '2',
    });
    const renderer = await render();

    await press(renderer, 'Switch');

    expect(mocked.switchOrganization).toHaveBeenCalledWith('token', '8');
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh');
    expect(mockNavigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'home' }] });
  });

  it('logs out another device and removes it from the list', async () => {
    mocked.revokeSession.mockResolvedValue(undefined);
    const renderer = await render();

    await press(renderer, 'Log out');

    expect(mocked.revokeSession).toHaveBeenCalledWith('token', '2');
    const shown = renderer.root.findAllByType(Text).map((t) => t.props.children);
    expect(shown).not.toContain('Old tablet');
  });

  it('deletes the account only after confirmation, then returns to login', async () => {
    mocked.deleteAccount.mockResolvedValue(undefined);
    useAuthStore.setState({ accessToken: 'a', refreshToken: 'r' });
    const renderer = await render();

    await press(renderer, 'Delete account');
    expect(mocked.deleteAccount).not.toHaveBeenCalled();

    await confirmAlert('Delete account');

    expect(mocked.deleteAccount).toHaveBeenCalledWith('token');
    expect(useAuthStore.getState().refreshToken).toBe('');
    expect(mockNavigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'login' }] });
  });
});

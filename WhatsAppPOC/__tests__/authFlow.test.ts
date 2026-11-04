/**
 * @format
 */
import { restoreSession, useAuthStore } from '../src/features/auth/store/authStore';
import { loadTokens, saveTokens } from '../src/services/auth/secureTokenStore';
import { apiPath } from '../src/environments/environment_urls';
import { queryClient } from '../src/services/api/queryClient';
import { socket } from '../src/services/socket';

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: async () => body,
});

const fetchMock = jest.fn();
const navigation = { navigate: jest.fn(), reset: jest.fn() };

const callsTo = (url: string) =>
  fetchMock.mock.calls.filter(([calledUrl]) => calledUrl === url);

const bodyOf = (call: any[]) => JSON.parse(call[1].body);

beforeEach(() => {
  fetchMock.mockReset();
  navigation.navigate.mockReset();
  navigation.reset.mockReset();
  (socket.connect as jest.Mock).mockClear();
  (globalThis as any).fetch = fetchMock;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  useAuthStore.setState({
    accessToken: '',
    refreshToken: '',
    otp: '',
    mobileNo: '9730700560',
    orgCode: 'ORG',
    serverOtpHint: null,
    errorMessage: null,
    nextStep: 'LOGIN',
    selectedCountry: {
      countryId: '1',
      countryName: 'India',
      countryCode: '+91',
      isoCode: 'IN',
      iso3Code: 'IND',
      flag: '',
    },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('send OTP', () => {
  it('shows no helper when the server does not echo the code', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { expiresIn: 300 } }));

    await useAuthStore.getState().handleSendOtp(navigation);

    expect(useAuthStore.getState().serverOtpHint).toBeNull();
    expect(navigation.navigate).toHaveBeenCalledWith('otp');
  });
});

describe('verify OTP', () => {
  it('requires all 6 digits', async () => {
    useAuthStore.setState({ otp: '1234' });

    await useAuthStore.getState().handleVerifyOtp(navigation);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().errorMessage).toContain('6-digit');
  });

  it('stores both tokens on login and opens home', async () => {
    useAuthStore.setState({ otp: '123456' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: { nextStep: 'LOGIN', token: 'access', refreshToken: 'refresh' },
      }),
    );

    await useAuthStore.getState().handleVerifyOtp(navigation);

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access');
    expect(state.refreshToken).toBe('refresh');
    expect(state.otp).toBe('');
    expect(socket.connect).toHaveBeenCalled();
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'home' }],
    });
  });

  it('keeps the setup token and goes to profile setup for a new user', async () => {
    useAuthStore.setState({ otp: '123456' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { nextStep: 'PROFILE_SETUP', token: 'setup' } }),
    );

    await useAuthStore.getState().handleVerifyOtp(navigation);

    expect(useAuthStore.getState().accessToken).toBe('setup');
    expect(useAuthStore.getState().refreshToken).toBe('');
    expect(navigation.navigate).toHaveBeenCalledWith('profile_setup');
  });
});

describe('setup', () => {
  it('profile setup signs in from its response, without verifying the OTP again', async () => {
    useAuthStore.setState({ accessToken: 'setup', otp: '123456', nextStep: 'PROFILE_SETUP' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { data: { token: 'access', refreshToken: 'refresh' } }),
    );

    await useAuthStore.getState().handleProfileSetupSave('A', 'B', '', navigation);

    expect(callsTo(apiPath.verifyOtp)).toHaveLength(0);
    const [call] = callsTo(apiPath.userProfile);
    expect(call[1].headers.Authorization).toBe('Bearer setup');
    expect(bodyOf(call).mobileNo).toBeUndefined();
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access');
    expect(state.refreshToken).toBe('refresh');
    expect(state.nextStep).toBe('LOGIN');
    expect(navigation.reset).toHaveBeenCalled();
  });

  it('organization setup signs in from its response', async () => {
    useAuthStore.setState({ accessToken: 'setup', nextStep: 'ORGANIZATION_SETUP' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { data: { token: 'access', refreshToken: 'refresh' } }),
    );

    await useAuthStore.getState().handleOrganizationSetupSave('ORG', navigation);

    expect(callsTo(apiPath.verifyOtp)).toHaveLength(0);
    expect(useAuthStore.getState().refreshToken).toBe('refresh');
  });

  it('waits for approval without signing in when the organization requires it', async () => {
    useAuthStore.setState({ accessToken: 'setup', otp: '123456', nextStep: 'PROFILE_SETUP' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(202, { data: { status: 'PENDING_APPROVAL', organizationName: 'Org A' } }),
    );

    await useAuthStore.getState().handleProfileSetupSave('A', '', '', navigation);

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('');
    expect(state.refreshToken).toBe('');
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'pending_approval', params: { organizationName: 'Org A' } }],
    });
  });

  it('shows the error and stays signed out when setup fails', async () => {
    useAuthStore.setState({ accessToken: 'setup' });
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { message: 'exists' }));

    await useAuthStore.getState().handleProfileSetupSave('A', '', '', navigation);

    expect(useAuthStore.getState().errorMessage).toBe('exists');
    expect(navigation.reset).not.toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('revokes the server session with the refresh token and clears local data', async () => {
    const clear = jest.spyOn(queryClient, 'clear');
    useAuthStore.setState({ accessToken: 'access', refreshToken: 'refresh' });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    useAuthStore.getState().handleLogout(navigation);

    const [call] = callsTo(apiPath.revoke);
    expect(bodyOf(call)).toEqual({ refreshToken: 'refresh' });
    expect(useAuthStore.getState().accessToken).toBe('');
    expect(useAuthStore.getState().refreshToken).toBe('');
    expect(clear).toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'login' }],
    });
  });

  it('still signs out locally when offline', async () => {
    useAuthStore.setState({ accessToken: 'access', refreshToken: 'refresh' });
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    useAuthStore.getState().handleLogout(navigation);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(useAuthStore.getState().refreshToken).toBe('');
    expect(navigation.reset).toHaveBeenCalled();
  });
});

describe('storage', () => {
  it('keeps tokens and the OTP out of plain app storage', () => {
    useAuthStore.setState({ otp: '123456', accessToken: 'access', refreshToken: 'refresh' });

    const persisted = useAuthStore.persist.getOptions().partialize!(
      useAuthStore.getState(),
    ) as Record<string, unknown>;

    expect(persisted.accessToken).toBeUndefined();
    expect(persisted.refreshToken).toBeUndefined();
    expect(persisted.otp).toBeUndefined();
    expect(persisted.serverOtpHint).toBeUndefined();
  });

  it('saves tokens to the Keychain and clears them on logout', async () => {
    useAuthStore.setState({ accessToken: 'access-k', refreshToken: 'refresh-k' });
    expect(await loadTokens()).toEqual({ accessToken: 'access-k', refreshToken: 'refresh-k' });

    useAuthStore.getState().clearSession();
    expect(await loadTokens()).toBeNull();
  });

  it('restores tokens from the Keychain on start', async () => {
    useAuthStore.setState({ accessToken: 'kept', refreshToken: 'kept-refresh' });
    await loadTokens();
    useAuthStore.setState({ accessToken: '', refreshToken: '' }, false);
    await saveTokens({ accessToken: 'kept', refreshToken: 'kept-refresh' });

    await restoreSession();

    expect(useAuthStore.getState().refreshToken).toBe('kept-refresh');
  });

  it('moves tokens saved by older builds into the Keychain', async () => {
    useAuthStore.getState().clearSession();
    await loadTokens();
    // Older builds hydrated tokens from MMKV straight into the store.
    useAuthStore.setState({ accessToken: 'legacy', refreshToken: 'legacy-refresh' });
    await saveTokens({ accessToken: '', refreshToken: '' });

    await restoreSession();

    expect(await loadTokens()).toEqual({ accessToken: 'legacy', refreshToken: 'legacy-refresh' });
  });
});

describe('login country', () => {
  const { pickCountry } = require('../src/features/auth/screens/LoginScreen');
  const server = [
    { countryId: '1', countryName: 'Afghanistan', countryCode: '+93', isoCode: 'AF' },
    { countryId: '102', countryName: 'India', countryCode: '+91', isoCode: 'IN' },
  ];

  it('defaults to India from the server list, not the first entry', () => {
    expect(pickCountry(server, null).countryId).toBe('102');
  });

  it('replaces a stale offline India (ID 1) with the server India', () => {
    expect(pickCountry(server, { countryId: '1', countryName: 'India', countryCode: '+91', isoCode: 'IN' }).countryId).toBe('102');
  });

  it('keeps a country the user picked', () => {
    expect(pickCountry(server, { countryId: '1', countryName: 'Afghanistan', countryCode: '+93', isoCode: 'AF' }).countryId).toBe('1');
  });
});

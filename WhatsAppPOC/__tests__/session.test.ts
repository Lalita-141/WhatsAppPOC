/**
 * @format
 */
import { fetchApi } from '../src/services/api/httpService';
import { useAuthStore } from '../src/features/auth/store/authStore';
import { socket, connectSocket } from '../src/services/socket';
import { queryClient } from '../src/services/api/queryClient';
import * as navigationRef from '../src/navigation/navigationRef';

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: async () => body,
});

const fetchMock = jest.fn();
const testSocket = socket as any;

const expired = () =>
  jsonResponse(401, { errorCode: 'TOKEN_EXPIRED', message: 'expired' });

const refreshed = (suffix = 'new') =>
  jsonResponse(200, {
    data: { token: `access-${suffix}`, refreshToken: `refresh-${suffix}` },
  });

const refreshCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith('auth/refresh'));

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(navigationRef, 'resetToLogin').mockImplementation(() => {});
  useAuthStore.setState({ accessToken: 'access-old', refreshToken: 'refresh-old' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('token refresh', () => {
  it('refreshes once and retries the request with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(refreshed())
      .mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }));

    const result = await fetchApi('GET', 'http://x/thing', 'access-old');

    expect(result).toEqual({ data: 'ok' });
    const [, retry] = fetchMock.mock.calls[2];
    expect(retry.headers.Authorization).toBe('Bearer access-new');
    expect(useAuthStore.getState().refreshToken).toBe('refresh-new');
  });

  it('shares one refresh between parallel requests', async () => {
    fetchMock.mockImplementation(async (url: string, init: any) => {
      if (url.endsWith('auth/refresh')) {
        return refreshed();
      }
      return init.headers.Authorization === 'Bearer access-new'
        ? jsonResponse(200, { data: 'ok' })
        : expired();
    });

    await Promise.all([
      fetchApi('GET', 'http://x/a', 'access-old'),
      fetchApi('GET', 'http://x/b', 'access-old'),
      fetchApi('GET', 'http://x/c', 'access-old'),
    ]);

    expect(refreshCalls()).toHaveLength(1);
  });

  it('uses the newest token when a screen still holds an old one', async () => {
    useAuthStore.setState({ accessToken: 'access-current' });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await fetchApi('GET', 'http://x/thing', 'access-stale');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer access-current',
    );
  });

  it('logs out when the server rejects the refresh token', async () => {
    const clear = jest.spyOn(queryClient, 'clear');
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(jsonResponse(401, { errorCode: 'INVALID_REFRESH_TOKEN' }));

    await expect(fetchApi('GET', 'http://x/thing', 'access-old')).rejects.toThrow();

    expect(useAuthStore.getState().accessToken).toBe('');
    expect(useAuthStore.getState().refreshToken).toBe('');
    expect(clear).toHaveBeenCalled();
    expect(navigationRef.resetToLogin).toHaveBeenCalled();
  });

  it('stays logged in when the refresh fails from a network error', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockRejectedValueOnce(new Error('offline'));

    await expect(fetchApi('GET', 'http://x/thing', 'access-old')).rejects.toThrow();

    expect(useAuthStore.getState().refreshToken).toBe('refresh-old');
    expect(navigationRef.resetToLogin).not.toHaveBeenCalled();
  });

  it('logs out immediately when the session was revoked', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { errorCode: 'SESSION_REVOKED', message: 'revoked' }),
    );

    await expect(fetchApi('GET', 'http://x/thing', 'access-old')).rejects.toThrow();

    expect(refreshCalls()).toHaveLength(0);
    expect(useAuthStore.getState().refreshToken).toBe('');
  });

  it('does not refresh for a request that had no token', async () => {
    useAuthStore.setState({ accessToken: '', refreshToken: '' });
    fetchMock.mockResolvedValueOnce(expired());

    await expect(fetchApi('POST', 'http://x/thing')).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('socket session', () => {
  it('connects with the newest token on every attempt', () => {
    const callback = jest.fn();
    useAuthStore.setState({ accessToken: 'access-1' });
    testSocket.auth(callback);
    expect(callback).toHaveBeenLastCalledWith({ token: 'access-1' });

    useAuthStore.setState({ accessToken: 'access-2' });
    testSocket.auth(callback);
    expect(callback).toHaveBeenLastCalledWith({ token: 'access-2' });
  });

  it('refreshes and reconnects once when the token expired', async () => {
    testSocket.connect.mockClear();
    fetchMock.mockResolvedValue(refreshed('socket'));

    await testSocket.trigger('connect');
    await testSocket.trigger('connect_error', new Error('TOKEN_EXPIRED'));
    expect(testSocket.connect).toHaveBeenCalledTimes(1);

    // A second failure in a row must not loop forever.
    await testSocket.trigger('connect_error', new Error('TOKEN_EXPIRED'));
    expect(testSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('logs out when the socket session is revoked', async () => {
    await testSocket.trigger('connect_error', new Error('SESSION_REVOKED'));

    expect(useAuthStore.getState().refreshToken).toBe('');
    expect(navigationRef.resetToLogin).toHaveBeenCalled();
  });

  it('does not reconnect a socket that is already connected', () => {
    testSocket.connect.mockClear();
    testSocket.connected = true;
    connectSocket('access-x');
    expect(testSocket.connect).not.toHaveBeenCalled();
    testSocket.connected = false;
  });
});

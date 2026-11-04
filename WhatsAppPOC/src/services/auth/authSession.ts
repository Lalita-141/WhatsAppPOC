import { apiPath } from '../../environments/environment_urls';

export interface SessionTokens {
  token: string;
  refreshToken: string;
}

interface SessionHandlers {
  getAccessToken: () => string;
  getRefreshToken: () => string;
  onTokensRefreshed: (tokens: SessionTokens) => void;
  onSessionExpired: () => void;
}

// The auth store registers itself here, which keeps the HTTP and socket layers
// from importing the store directly (the store imports both of them).
let handlers: SessionHandlers | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export const registerSessionHandlers = (sessionHandlers: SessionHandlers) => {
  handlers = sessionHandlers;
};

export const getLatestAccessToken = () => handlers?.getAccessToken() || '';

export const expireSession = () => {
  handlers?.onSessionExpired();
};

const requestNewTokens = async (): Promise<string | null> => {
  const refreshToken = handlers?.getRefreshToken();

  if (!refreshToken) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(apiPath.refresh, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });

    // Only the server saying the session is over ends it. A network failure
    // must not log the user out, so it keeps the stored tokens for a retry.
    if (response.status === 401) {
      expireSession();
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    handlers?.onTokensRefreshed({
      token: result.data.token,
      refreshToken: result.data.refreshToken,
    });

    return result.data.token;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Refresh tokens rotate, so concurrent callers must share a single request.
export const refreshAccessToken = (): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = requestNewTokens().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
};

/**
 * The membership the current access token belongs to. Read from the token's
 * payload without verifying it: the server verifies; this is only used to
 * ignore a late notification meant for another organization.
 */
export const currentUserOrganizationId = (): string | null => {
  const token = getLatestAccessToken();
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const { atob } = globalThis as unknown as { atob: (data: string) => string };
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).userOrganizationId ?? null;
  } catch {
    return null;
  }
};

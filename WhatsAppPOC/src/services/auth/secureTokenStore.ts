import * as Keychain from 'react-native-keychain';

// Tokens live in the iOS Keychain or Android Keystore, which encrypt them and
// keep them out of backups. Other app state stays in MMKV.
const SERVICE = 'whatsapppoc.session';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

// Writes run one at a time, so an older save cannot finish after a newer one.
let writeQueue: Promise<void> = Promise.resolve();

export const saveTokens = (tokens: StoredTokens) => {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      if (tokens.accessToken || tokens.refreshToken) {
        await Keychain.setGenericPassword('session', JSON.stringify(tokens), {
          service: SERVICE,
          accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        });
      } else {
        await Keychain.resetGenericPassword({ service: SERVICE });
      }
    });

  return writeQueue;
};

export const loadTokens = async (): Promise<StoredTokens | null> => {
  await writeQueue.catch(() => undefined);

  try {
    const credentials = await Keychain.getGenericPassword({ service: SERVICE });

    if (!credentials) {
      return null;
    }

    const parsed = JSON.parse(credentials.password);

    return {
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : '',
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
    };
  } catch {
    return null;
  }
};

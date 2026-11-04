import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { storage } from '../../core/store/storage';

// The lock is a Keychain item that can only be read after Face ID, a
// fingerprint or the device passcode. Reading it is the unlock check.
const SERVICE = 'whatsapppoc.app-lock';
const ENABLED_KEY = 'app-lock-enabled';
// Coming back within this time does not lock again, so a quick photo pick or
// call notification does not prompt.
const GRACE_MS = 30 * 1000;

export const isAppLockEnabled = () => storage.getBoolean(ENABLED_KEY) === true;

const prompt = { title: 'Unlock', cancel: 'Cancel' };

export const enableAppLock = async () => {
  await Keychain.setGenericPassword('lock', 'unlocked', {
    service: SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  });
  // Confirm it works before turning the lock on.
  if (!(await unlock())) {
    await Keychain.resetGenericPassword({ service: SERVICE });
    throw new Error('Unlock was not confirmed');
  }
  storage.set(ENABLED_KEY, true);
};

export const disableAppLock = async () => {
  storage.set(ENABLED_KEY, false);
  await Keychain.resetGenericPassword({ service: SERVICE });
};

export const unlock = async () => {
  try {
    return Boolean(await Keychain.getGenericPassword({ service: SERVICE, authenticationPrompt: prompt }));
  } catch {
    return false;
  }
};

/** Covers the app until the owner unlocks it, at launch and after time away. */
export const AppLockGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLocked, setIsLocked] = useState(isAppLockEnabled);
  const backgroundedAt = useRef<number | null>(null);

  const tryUnlock = useCallback(async () => {
    if (await unlock()) setIsLocked(false);
  }, []);

  useEffect(() => {
    if (isLocked) tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!isAppLockEnabled()) return;
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current && Date.now() - backgroundedAt.current > GRACE_MS) {
        setIsLocked(true);
        tryUnlock();
      }
    });
    return () => sub.remove();
  }, [tryUnlock]);

  return (
    <>
      {children}
      {isLocked && (
        <View style={styles.cover}>
          <Text style={styles.icon}>🔒</Text>
          <Text style={styles.title}>App locked</Text>
          <TouchableOpacity style={styles.button} onPress={tryUnlock} accessibilityRole="button">
            <Text style={styles.buttonText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0B141A', alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 24 },
  button: { backgroundColor: '#00A884', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});

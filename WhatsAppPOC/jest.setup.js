/* eslint-env jest */
jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    values = new Map();
    set(key, value) {
      this.values.set(key, value);
    }
    getString(key) {
      return this.values.get(key);
    }
    getBoolean(key) {
      return this.values.get(key);
    }
    getNumber(key) {
      return this.values.get(key);
    }
    delete(key) {
      this.values.delete(key);
    }
    clearAll() {
      this.values.clear();
    }
  },
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'fcm-token'),
  requestPermission: jest.fn(async () => 1),
  registerDeviceForRemoteMessages: jest.fn(async () => {}),
  onMessage: jest.fn(() => () => {}),
  onNotificationOpenedApp: jest.fn(() => () => {}),
  getInitialNotification: jest.fn(async () => null),
  onTokenRefresh: jest.fn(() => () => {}),
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
}));

jest.mock('react-native-contacts', () => ({
  requestPermission: jest.fn(async () => 'denied'),
  getAll: jest.fn(async () => []),
}));

jest.mock('socket.io-client', () => {
  const listeners = {};
  const socket = {
    connected: false,
    auth: undefined,
    id: 'test-socket',
    on: jest.fn((event, handler) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    }),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    trigger: (event, payload) =>
      Promise.all((listeners[event] || []).map((handler) => handler(payload))),
  };
  return {
    io: jest.fn((_url, options) => {
      socket.auth = options.auth;
      return socket;
    }),
  };
});

jest.mock('react-native-keychain', () => {
  const store = new Map();
  return {
    ACCESSIBLE: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AfterFirstUnlockThisDeviceOnly', WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WhenPasscodeSetThisDeviceOnly' },
    ACCESS_CONTROL: { BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'BiometryAnyOrDevicePasscode' },
    setGenericPassword: jest.fn(async (username, password, options) => {
      store.set(options?.service, { username, password });
      return { service: options?.service, storage: 'test' };
    }),
    getGenericPassword: jest.fn(async (options) => store.get(options?.service) || false),
    resetGenericPassword: jest.fn(async (options) => store.delete(options?.service)),
  };
});

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
  launchCamera: jest.fn(async () => ({ didCancel: true })),
}));

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(async () => []),
  keepLocalCopy: jest.fn(async () => []),
  types: { allFiles: '*/*' },
}));

jest.mock('react-native-video', () => 'Video');

jest.mock('react-native-blob-util', () => {
  const request = { uploadProgress: jest.fn(), progress: jest.fn() };
  const blobUtil = {
    fetch: jest.fn(() => request),
    wrap: jest.fn((path) => `RNFetchBlob-file://${path}`),
    config: jest.fn(() => blobUtil),
    fs: { stat: jest.fn(async () => ({ size: 1 })) },
    ios: { openDocument: jest.fn() },
    android: { actionViewIntent: jest.fn() },
  };
  request.uploadProgress.mockReturnValue(request);
  request.progress.mockReturnValue(request);
  return { __esModule: true, default: blobUtil };
});

jest.mock('react-native-nitro-sound', () => ({
  createSound: jest.fn(() => ({
    startRecorder: jest.fn(async () => 'file:///tmp/voice.m4a'),
    stopRecorder: jest.fn(async () => 'file:///tmp/voice.m4a'),
    startPlayer: jest.fn(async () => ''),
    stopPlayer: jest.fn(async () => ''),
    pausePlayer: jest.fn(async () => ''),
    resumePlayer: jest.fn(async () => ''),
    addRecordBackListener: jest.fn(),
    removeRecordBackListener: jest.fn(),
    addPlayBackListener: jest.fn(),
    removePlayBackListener: jest.fn(),
    addPlaybackEndListener: jest.fn(),
    removePlaybackEndListener: jest.fn(),
  })),
}));

jest.mock('react-native-webrtc', () => ({
  RTCView: 'RTCView',
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
  MediaStream: jest.fn(),
  mediaDevices: { getUserMedia: jest.fn() },
}));

jest.mock('react-native-incall-manager', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    startRingtone: jest.fn(),
    stopRingtone: jest.fn(),
    setForceSpeakerphoneOn: jest.fn(),
  },
}));

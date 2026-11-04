import { PermissionsAndroid } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { socket } from '../src/services/socket';
import { endCall, initCallSignaling, rejectCall, startCall, useCallStore } from '../src/features/calls/state/callStore';

const mockSocket = socket as unknown as { emit: jest.Mock; trigger: (event: string, payload: unknown) => Promise<unknown> };

let stop: () => void;
beforeAll(() => {
  stop = initCallSignaling();
});
afterAll(() => stop());

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
    'android.permission.RECORD_AUDIO': 'granted',
    'android.permission.CAMERA': 'granted',
  } as any);
  useCallStore.setState({ phase: null, callId: null, peer: null });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('calls', () => {
  it('invites, shows ringing, and cancels when the caller hangs up first', async () => {
    await startCall({ userOrganizationId: '5', name: 'Bob' }, 'VIDEO');
    expect(mockSocket.emit).toHaveBeenCalledWith('call:invite', { calleeUserOrganizationId: '5', type: 'VIDEO' });
    expect(useCallStore.getState().phase).toBe('outgoing');

    await mockSocket.trigger('call:created', { callId: '11' });
    await mockSocket.trigger('call:ringing', { callId: '11' });
    expect(useCallStore.getState().statusText).toBe('Ringing…');

    endCall();
    expect(mockSocket.emit).toHaveBeenCalledWith('call:cancel', { callId: '11' });
    expect(useCallStore.getState().phase).toBe('ended');
  });

  it('rings for an incoming call and declines it', async () => {
    await mockSocket.trigger('call:incoming', { callId: '12', callerUserOrganizationId: '6', callerName: 'Carol', type: 'AUDIO' });
    const state = useCallStore.getState();
    expect(state.phase).toBe('incoming');
    expect(state.peer?.name).toBe('Carol');
    expect(InCallManager.startRingtone).toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith('call:ringing', { callId: '12' });

    rejectCall();
    expect(mockSocket.emit).toHaveBeenCalledWith('call:reject', { callId: '12' });
    expect(InCallManager.stopRingtone).toHaveBeenCalled();
  });

  it('stops ringing when the call is answered on another device', async () => {
    await mockSocket.trigger('call:incoming', { callId: '13', callerUserOrganizationId: '6', callerName: 'Carol', type: 'AUDIO' });
    await mockSocket.trigger('call:answered-elsewhere', { callId: '13' });
    expect(useCallStore.getState().statusText).toBe('Answered on another device');
  });

  it('shows busy and ignores events for other calls', async () => {
    await startCall({ userOrganizationId: '5', name: 'Bob' }, 'AUDIO');
    await mockSocket.trigger('call:created', { callId: '14' });
    await mockSocket.trigger('call:ended', { callId: '999', status: 'ENDED' });
    expect(useCallStore.getState().phase).toBe('outgoing');

    await mockSocket.trigger('call:busy', { callId: '14' });
    expect(useCallStore.getState().statusText).toBe('Busy');
  });
});

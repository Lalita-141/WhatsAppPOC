import { PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import { socket } from '../../../services/socket';
import { getIceServers } from '../api/callApi';

export type CallType = 'AUDIO' | 'VIDEO';
export type CallPhase = 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

export interface CallState {
  callId: string | null;
  peer: { userOrganizationId: string; name: string } | null;
  type: CallType;
  direction: 'INCOMING' | 'OUTGOING';
  phase: CallPhase | null;
  statusText: string;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isCameraOn: boolean;
  isFrontCamera: boolean;
  localStreamUrl: string | null;
  remoteStreamUrl: string | null;
  connectedAt: number | null;
  isReconnecting: boolean;
}

const idle: CallState = {
  callId: null,
  peer: null,
  type: 'AUDIO',
  direction: 'OUTGOING',
  phase: null,
  statusText: '',
  isMuted: false,
  isSpeakerOn: false,
  isCameraOn: true,
  isFrontCamera: true,
  localStreamUrl: null,
  remoteStreamUrl: null,
  connectedAt: null,
  isReconnecting: false,
};

export const useCallStore = create<CallState>(() => ({ ...idle }));

// WebRTC objects stay outside React state.
let peer: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let pendingCandidates: unknown[] = [];
let hasRemoteDescription = false;

const set = (partial: Partial<CallState>) => useCallStore.setState(partial);
const get = () => useCallStore.getState();

const ensurePermissions = async (type: CallType) => {
  if (Platform.OS !== 'android') return true;
  const wanted = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, ...(type === 'VIDEO' ? [PermissionsAndroid.PERMISSIONS.CAMERA] : [])];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
};

const cleanup = () => {
  localStream?.getTracks().forEach((t) => t.stop());
  localStream?.release();
  localStream = null;
  peer?.close();
  peer = null;
  pendingCandidates = [];
  hasRemoteDescription = false;
  InCallManager.stopRingtone();
  InCallManager.stop();
};

const finish = (text: string) => {
  cleanup();
  set({ phase: 'ended', statusText: text, remoteStreamUrl: null, localStreamUrl: null });
  setTimeout(() => {
    if (get().phase === 'ended') useCallStore.setState({ ...idle });
  }, 1500);
};

/** Opens the camera/microphone and the peer connection once a call is answered. */
const connect = async (isCaller: boolean) => {
  const { type, callId } = get();
  set({ phase: 'connecting', statusText: 'Connecting…' });
  const { iceServers } = await getIceServers();

  localStream = await mediaDevices.getUserMedia({ audio: true, video: type === 'VIDEO' ? { facingMode: 'user' } : false });
  set({ localStreamUrl: type === 'VIDEO' ? localStream.toURL() : null });
  InCallManager.start({ media: type === 'VIDEO' ? 'video' : 'audio' });
  InCallManager.setForceSpeakerphoneOn(type === 'VIDEO');
  set({ isSpeakerOn: type === 'VIDEO' });

  const connection = new RTCPeerConnection({ iceServers });
  peer = connection;
  localStream.getTracks().forEach((track) => connection.addTrack(track, localStream!));

  connection.addEventListener('icecandidate', (event: any) => {
    if (event.candidate) socket.emit('call:ice', { callId, payload: event.candidate });
  });
  connection.addEventListener('track', (event: any) => {
    const stream = event.streams?.[0];
    if (stream) set({ remoteStreamUrl: stream.toURL() });
  });
  connection.addEventListener('connectionstatechange', () => {
    const state = connection.connectionState;
    if (state === 'connected') set({ phase: 'active', statusText: '', connectedAt: get().connectedAt ?? Date.now(), isReconnecting: false });
    if (state === 'disconnected') set({ isReconnecting: true });
    if (state === 'failed' && get().direction === 'OUTGOING') {
      // The caller restarts ICE, which renegotiates a new network path.
      connection.restartIce();
      sendOffer({ iceRestart: true }).catch(() => undefined);
    }
  });

  if (isCaller) await sendOffer();
};

const sendOffer = async (options?: { iceRestart?: boolean }) => {
  if (!peer) return;
  const offer = await peer.createOffer(options ?? {});
  await peer.setLocalDescription(offer);
  socket.emit('call:offer', { callId: get().callId, payload: offer });
};

const flushCandidates = async () => {
  hasRemoteDescription = true;
  for (const candidate of pendingCandidates) await peer?.addIceCandidate(new RTCIceCandidate(candidate as any));
  pendingCandidates = [];
};

export const startCall = async (peerInfo: { userOrganizationId: string; name: string }, type: CallType) => {
  if (get().phase) return;
  if (!(await ensurePermissions(type))) {
    throw new Error(type === 'VIDEO' ? 'Allow camera and microphone access to call.' : 'Allow microphone access to call.');
  }
  useCallStore.setState({ ...idle, peer: peerInfo, type, direction: 'OUTGOING', phase: 'outgoing', statusText: 'Calling…', isCameraOn: type === 'VIDEO' });
  socket.emit('call:invite', { calleeUserOrganizationId: peerInfo.userOrganizationId, type });
};

export const acceptCall = async () => {
  const { callId, type } = get();
  if (!callId) return;
  InCallManager.stopRingtone();
  if (!(await ensurePermissions(type))) {
    socket.emit('call:reject', { callId });
    finish('Permission denied');
    return;
  }
  socket.emit('call:accept', { callId });
  await connect(false).catch(() => endCall());
};

export const rejectCall = () => {
  const { callId } = get();
  if (callId) socket.emit('call:reject', { callId });
  finish('Declined');
};

export const endCall = () => {
  const { callId, phase } = get();
  if (callId) socket.emit(phase === 'outgoing' ? 'call:cancel' : 'call:end', { callId });
  finish('Call ended');
};

export const toggleMute = () => {
  const muted = !get().isMuted;
  localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  set({ isMuted: muted });
};

export const toggleSpeaker = () => {
  const on = !get().isSpeakerOn;
  InCallManager.setForceSpeakerphoneOn(on);
  set({ isSpeakerOn: on });
};

export const toggleCamera = () => {
  const on = !get().isCameraOn;
  localStream?.getVideoTracks().forEach((t) => (t.enabled = on));
  set({ isCameraOn: on });
};

export const switchCamera = async () => {
  const front = !get().isFrontCamera;
  for (const track of localStream?.getVideoTracks() ?? []) {
    await track.applyConstraints({ facingMode: front ? 'user' : 'environment' } as any);
  }
  set({ isFrontCamera: front });
};

const ENDED_TEXT: Record<string, string> = {
  REJECTED: 'Declined',
  MISSED: 'No answer',
  CANCELLED: 'Call cancelled',
  ENDED: 'Call ended',
  FAILED: 'Call failed',
};

/** Listens for call events for the whole app. Call once after login. */
export const initCallSignaling = () => {
  const mine = (data: { callId?: string }) => data?.callId && data.callId === get().callId;

  const handlers: Record<string, (data: any) => void> = {
    'call:created': (data) => set({ callId: data.callId }),
    'call:incoming': (data) => {
      if (get().phase) {
        // Already in a call: the server already marked us busy for new callers,
        // so this can only be a repeat of the call we are handling.
        return;
      }
      useCallStore.setState({
        ...idle,
        callId: data.callId,
        peer: { userOrganizationId: data.callerUserOrganizationId, name: data.callerName },
        type: data.type,
        direction: 'INCOMING',
        phase: 'incoming',
        statusText: data.type === 'VIDEO' ? 'Incoming video call' : 'Incoming voice call',
        isCameraOn: data.type === 'VIDEO',
      });
      InCallManager.startRingtone('_DEFAULT_', [800, 400], 'playback', 45);
      socket.emit('call:ringing', { callId: data.callId });
    },
    'call:ringing': (data) => mine(data) && set({ statusText: 'Ringing…' }),
    'call:busy': () => finish('Busy'),
    'call:accepted': (data) => mine(data) && connect(true).catch(() => endCall()),
    'call:answered-elsewhere': (data) => mine(data) && finish('Answered on another device'),
    'call:offer': async (data) => {
      if (!mine(data) || !peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(data.payload));
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('call:answer', { callId: data.callId, payload: answer });
    },
    'call:answer': async (data) => {
      if (!mine(data) || !peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(data.payload));
      await flushCandidates();
    },
    'call:ice': async (data) => {
      if (!mine(data)) return;
      if (peer && hasRemoteDescription) await peer.addIceCandidate(new RTCIceCandidate(data.payload)).catch(() => undefined);
      else pendingCandidates.push(data.payload);
    },
    'call:peer-reconnecting': (data) => mine(data) && set({ isReconnecting: true }),
    'call:peer-reconnected': (data) => {
      if (!mine(data)) return;
      set({ isReconnecting: false });
      if (get().direction === 'OUTGOING') {
        peer?.restartIce();
        sendOffer({ iceRestart: true }).catch(() => undefined);
      }
    },
    'call:ended': (data) => mine(data) && finish(ENDED_TEXT[data.status] ?? 'Call ended'),
    'call:error': (data) => {
      if (!data?.callId || mine(data)) finish(data?.message || 'Call failed');
    },
    // Our own connection came back during a call: rejoin it.
    connect: () => {
      const { callId, phase } = get();
      if (callId && (phase === 'active' || phase === 'connecting')) socket.emit('call:rejoin', { callId });
    },
  };

  Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
  return () => Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
};

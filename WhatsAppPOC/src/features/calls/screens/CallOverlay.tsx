import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { Avatar } from '../../../components/media/Avatar';
import {
  acceptCall,
  endCall,
  rejectCall,
  switchCamera,
  toggleCamera,
  toggleMute,
  toggleSpeaker,
  useCallStore,
} from '../state/callStore';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const Control: React.FC<{ label: string; icon: string; active?: boolean; danger?: boolean; onPress: () => void }> = ({ label, icon, active, danger, onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.control} accessibilityLabel={label} accessibilityState={{ selected: active }}>
    <View style={[styles.controlCircle, { backgroundColor: danger ? '#E53935' : active ? '#FFFFFF' : '#FFFFFF33' }]}>
      <Text style={{ fontSize: 22, color: active ? '#000' : '#FFF' }}>{icon}</Text>
    </View>
    <Text style={styles.controlLabel}>{label}</Text>
  </TouchableOpacity>
);

/** Full-screen call UI, shown above everything while a call exists. */
export const CallOverlay: React.FC = () => {
  const call = useCallStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (call.phase !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [call.phase]);

  if (!call.phase || !call.peer) return null;

  const isVideo = call.type === 'VIDEO';
  const status = call.isReconnecting
    ? 'Reconnecting…'
    : call.phase === 'active' && call.connectedAt
    ? clock(now - call.connectedAt)
    : call.statusText;

  return (
    <Modal visible animationType="slide" onRequestClose={endCall} supportedOrientations={['portrait']}>
      <View style={styles.container}>
        {isVideo && call.remoteStreamUrl ? (
          <RTCView streamURL={call.remoteStreamUrl} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} />
        ) : null}

        <View style={styles.top}>
          {!(isVideo && call.remoteStreamUrl) && <Avatar name={call.peer.name} size={110} />}
          <Text style={styles.name}>{call.peer.name}</Text>
          <Text style={styles.status}>{status}</Text>
        </View>

        {isVideo && call.localStreamUrl && call.isCameraOn ? (
          <RTCView streamURL={call.localStreamUrl} style={styles.self} objectFit="cover" mirror={call.isFrontCamera} zOrder={1} />
        ) : null}

        <View style={styles.bottom}>
          {call.phase === 'incoming' ? (
            <View style={styles.row}>
              <Control label="Decline" icon="✕" danger onPress={rejectCall} />
              <Control label="Accept" icon={isVideo ? '📹' : '📞'} onPress={() => acceptCall()} active />
            </View>
          ) : call.phase === 'ended' ? null : (
            <>
              <View style={styles.row}>
                <Control label={call.isMuted ? 'Unmute' : 'Mute'} icon="🎙" active={call.isMuted} onPress={toggleMute} />
                <Control label="Speaker" icon="🔊" active={call.isSpeakerOn} onPress={toggleSpeaker} />
                {isVideo && <Control label={call.isCameraOn ? 'Camera off' : 'Camera on'} icon="📷" active={!call.isCameraOn} onPress={toggleCamera} />}
                {isVideo && <Control label="Flip" icon="🔄" onPress={() => switchCamera()} />}
              </View>
              <View style={[styles.row, { marginTop: 24 }]}>
                <Control label="End" icon="✕" danger onPress={endCall} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B141A', justifyContent: 'space-between' },
  top: { alignItems: 'center', paddingTop: 90, gap: 10 },
  name: { color: '#FFF', fontSize: 26, fontWeight: '700' },
  status: { color: '#FFFFFFCC', fontSize: 16 },
  self: { position: 'absolute', top: 60, right: 16, width: 110, height: 160, borderRadius: 12, overflow: 'hidden' },
  bottom: { paddingBottom: 60 },
  row: { flexDirection: 'row', justifyContent: 'space-evenly' },
  control: { alignItems: 'center', width: 80 },
  controlCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { color: '#FFF', fontSize: 12, marginTop: 6 },
});

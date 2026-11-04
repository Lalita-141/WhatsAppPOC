import React, { useEffect, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { createSound } from 'react-native-nitro-sound';
import { LocalFile } from '../../services/media/mediaService';

const MAX_MS = 15 * 60 * 1000;

const ensureMicrophone = async () => {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return result === PermissionsAndroid.RESULTS.GRANTED;
};

interface Props {
  color: string;
  background: string;
  onCancel: () => void;
  onRecorded: (file: LocalFile) => void;
}

/** Records an AAC voice message. Shown instead of the text box while recording. */
export const VoiceRecorder: React.FC<Props> = ({ color, background, onCancel, onRecorded }) => {
  const recorder = useRef(createSound());
  const [elapsed, setElapsed] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const sound = recorder.current;
    let cancelled = false;

    (async () => {
      if (!(await ensureMicrophone())) {
        Alert.alert('Microphone permission needed', 'Allow microphone access in Settings to record voice messages.');
        onCancel();
        return;
      }
      try {
        sound.addRecordBackListener((e) => {
          elapsedRef.current = e.currentPosition;
          setElapsed(e.currentPosition);
          if (e.currentPosition >= MAX_MS) stop(true);
        });
        await sound.startRecorder(undefined, { AudioEncodingBitRate: 64000, AudioSamplingRate: 44100, AudioChannels: 1, AVFormatIDKeyIOS: 'aac' });
        if (!cancelled) setIsRecording(true);
      } catch (error: any) {
        Alert.alert('Could not record', error?.message || 'Please try again.');
        onCancel();
      }
    })();

    return () => {
      cancelled = true;
      sound.removeRecordBackListener();
      sound.stopRecorder().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = async (send: boolean) => {
    const sound = recorder.current;
    sound.removeRecordBackListener();
    const uri = await sound.stopRecorder().catch(() => null);
    setIsRecording(false);
    if (!send || !uri || elapsedRef.current < 700) {
      onCancel();
      return;
    }
    const path = uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
    const stat = await ReactNativeBlobUtil.fs.stat(path);
    onRecorded({ uri, name: `voice-${Date.now()}.m4a`, type: 'audio/mp4', size: Number(stat.size), durationMs: Math.round(elapsedRef.current) });
  };

  const seconds = Math.floor(elapsed / 1000);

  return (
    <View style={[styles.bar, { backgroundColor: background }]}>
      <TouchableOpacity onPress={() => stop(false)} accessibilityLabel="Cancel recording" style={styles.side}>
        <Text style={{ color: '#E53935', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
      </TouchableOpacity>
      <Text style={{ color, fontSize: 16, flex: 1, textAlign: 'center' }}>
        {isRecording ? '🔴 ' : ''}
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </Text>
      <TouchableOpacity onPress={() => stop(true)} accessibilityLabel="Send voice message" style={styles.side} disabled={!isRecording}>
        <Text style={{ color, fontSize: 15, fontWeight: '700' }}>Send</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10 },
  side: { paddingHorizontal: 6 },
});

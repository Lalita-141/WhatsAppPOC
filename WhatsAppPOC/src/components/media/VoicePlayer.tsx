import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createSound } from 'react-native-nitro-sound';
import { getMediaUrl, MediaInfo } from '../../services/media/mediaService';

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Streams a voice message or audio file from its signed link. */
export const VoicePlayer: React.FC<{ media: MediaInfo; color: string }> = ({ media, color }) => {
  const sound = useRef<ReturnType<typeof createSound> | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(media.durationMs ?? 0);

  useEffect(
    () => () => {
      sound.current?.stopPlayer().catch(() => undefined);
      sound.current?.removePlayBackListener();
      sound.current?.removePlaybackEndListener();
    },
    [],
  );

  const toggle = async () => {
    try {
      if (state === 'playing') {
        await sound.current?.pausePlayer();
        setState('paused');
        return;
      }
      if (state === 'paused') {
        await sound.current?.resumePlayer();
        setState('playing');
        return;
      }
      setState('loading');
      const player = sound.current ?? createSound();
      sound.current = player;
      player.addPlayBackListener((e) => {
        setPosition(e.currentPosition);
        if (e.duration) setDuration(e.duration);
      });
      player.addPlaybackEndListener(() => {
        setState('idle');
        setPosition(0);
      });
      await player.startPlayer(await getMediaUrl(media.mediaId));
      setState('playing');
    } catch {
      setState('idle');
    }
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={toggle} style={[styles.button, { borderColor: color }]} accessibilityLabel={state === 'playing' ? 'Pause' : 'Play'}>
        {state === 'loading' ? <ActivityIndicator size="small" color={color} /> : <Text style={{ color, fontSize: 16 }}>{state === 'playing' ? '❚❚' : '▶'}</Text>}
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={[styles.track, { backgroundColor: `${color}33` }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: color }]} />
        </View>
        <Text style={{ color, fontSize: 11, marginTop: 4 }}>
          {media.kind === 'VOICE' ? '🎤 ' : '🎵 '}
          {clock(state === 'idle' ? duration : position)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', width: 220, gap: 10, paddingVertical: 4 },
  button: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
});

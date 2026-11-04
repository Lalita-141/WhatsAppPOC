import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getMediaUrl } from '../../services/media/mediaService';

const COLORS = ['#25D366', '#00A884', '#5C6BC0', '#26A69A', '#EC407A', '#FFA726', '#AB47BC', '#29B6F6'];

const colorFor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
};

interface Props {
  name: string;
  mediaId?: string | null;
  size?: number;
  fallback?: string;
}

/** A profile photo when one is set and visible, otherwise the first letter. */
export const Avatar: React.FC<Props> = ({ name, mediaId, size = 50, fallback }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (mediaId) {
      getMediaUrl(mediaId, 'thumbnail').then((u) => active && setUrl(u)).catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [mediaId]);

  const style = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return <Image source={{ uri: url }} style={style} accessibilityLabel={`${name} profile photo`} />;
  }
  return (
    <View style={[styles.letter, style, { backgroundColor: colorFor(name || '?') }]}>
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>{fallback ?? (name ? name.charAt(0).toUpperCase() : '?')}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  letter: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '700' },
});

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Video from 'react-native-video';
import { downloadAndOpen, formatBytes, getMediaUrl, MediaInfo } from '../../services/media/mediaService';
import { VoicePlayer } from './VoicePlayer';

const useSignedUrl = (mediaId: string, variant: 'original' | 'thumbnail', enabled = true) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getMediaUrl(mediaId, variant).then((u) => active && setUrl(u)).catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [mediaId, variant, enabled]);
  return url;
};

const Viewer: React.FC<{ media: MediaInfo; onClose: () => void }> = ({ media, onClose }) => {
  const url = useSignedUrl(media.mediaId, 'original');
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close">
          <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
        {!url ? (
          <ActivityIndicator color="#FFF" />
        ) : media.kind === 'VIDEO' ? (
          <Video source={{ uri: url }} style={styles.full} controls resizeMode="contain" paused={false} />
        ) : (
          <Image source={{ uri: url }} style={styles.full} resizeMode="contain" />
        )}
      </View>
    </Modal>
  );
};

interface Props {
  media: MediaInfo;
  textColor: string;
  mutedColor: string;
  /** Upload progress for a message still being sent, from 0 to 1. */
  uploadProgress?: number;
  localUri?: string;
}

export const MediaAttachment: React.FC<Props> = ({ media, textColor, mutedColor, uploadProgress, localUri }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [download, setDownload] = useState<number | null>(null);
  const isUploading = uploadProgress !== undefined;
  const thumb = useSignedUrl(media.mediaId, 'thumbnail', !isUploading && media.hasThumbnail);
  const ratio = media.width && media.height ? media.width / media.height : 4 / 3;

  if (media.kind === 'VOICE' || media.kind === 'AUDIO') {
    return isUploading ? (
      <Text style={{ color: mutedColor }}>🎤 Sending… {Math.round(uploadProgress! * 100)}%</Text>
    ) : (
      <VoicePlayer media={media} color={textColor} />
    );
  }

  if (media.kind === 'DOCUMENT') {
    const open = async () => {
      setDownload(0);
      try {
        await downloadAndOpen(media, setDownload);
      } catch (error: any) {
        Alert.alert('Could not open file', error?.message || 'Please try again.');
      } finally {
        setDownload(null);
      }
    };
    return (
      <Pressable onPress={isUploading ? undefined : open} style={styles.doc} accessibilityLabel={`Open ${media.fileName}`}>
        <Text style={{ fontSize: 26 }}>📄</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: textColor, fontWeight: '600' }} numberOfLines={2}>{media.fileName}</Text>
          <Text style={{ color: mutedColor, fontSize: 12 }}>
            {isUploading
              ? `Uploading ${Math.round(uploadProgress! * 100)}%`
              : download !== null
              ? `Downloading ${Math.round(download * 100)}%`
              : formatBytes(media.size)}
          </Text>
        </View>
      </Pressable>
    );
  }

  // IMAGE and VIDEO
  const source = localUri ?? thumb;
  return (
    <>
      <Pressable onPress={() => !isUploading && setIsOpen(true)} accessibilityLabel={media.kind === 'VIDEO' ? 'Play video' : 'Open photo'}>
        <View style={[styles.preview, { aspectRatio: Math.max(0.6, Math.min(ratio, 1.8)) }]}>
          {source ? <Image source={{ uri: source }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          {media.kind === 'VIDEO' && !isUploading && (
            <View style={styles.play}>
              <Text style={{ color: '#FFF', fontSize: 22 }}>▶</Text>
            </View>
          )}
          {isUploading && (
            <View style={styles.play}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>{Math.round(uploadProgress! * 100)}%</Text>
            </View>
          )}
        </View>
      </Pressable>
      {isOpen && <Viewer media={media} onClose={() => setIsOpen(false)} />}
    </>
  );
};

const styles = StyleSheet.create({
  preview: { width: 240, borderRadius: 8, overflow: 'hidden', backgroundColor: '#00000022', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 230, paddingVertical: 4 },
  viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '100%' },
  close: { position: 'absolute', top: 50, right: 20, zIndex: 2, padding: 10 },
});

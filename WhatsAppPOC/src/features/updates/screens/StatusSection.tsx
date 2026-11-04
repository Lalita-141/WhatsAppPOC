import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Video from 'react-native-video';
import { useTheme } from '../../../core/theme';
import { Avatar } from '../../../components/media/Avatar';
import { pickFromLibrary } from '../../../components/media/attachmentPicker';
import { getMediaUrl, uploadFile } from '../../../services/media/mediaService';
import * as api from '../api/updatesApi';

const COLORS = ['#00A884', '#5C6BC0', '#EC407A', '#FFA726', '#26A69A', '#37474F'];
const IMAGE_DURATION_MS = 5000;

const ago = (value: string) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
};

const StatusMedia: React.FC<{ item: api.StatusItem; onEnd: () => void }> = ({ item, onEnd }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (item.media) getMediaUrl(item.media.mediaId).then(setUrl).catch(() => setUrl(null));
  }, [item.media]);
  if (!url) return <ActivityIndicator color="#FFF" />;
  return item.kind === 'VIDEO' ? (
    <Video source={{ uri: url }} style={styles.full} resizeMode="contain" onEnd={onEnd} />
  ) : (
    <Image source={{ uri: url }} style={styles.full} resizeMode="contain" />
  );
};

/** Plays one person's statuses in order and records each view. */
const StatusViewer: React.FC<{ token: string; group: api.StatusGroup; onClose: () => void }> = ({ token, group, onClose }) => {
  const [index, setIndex] = useState(0);
  const item = group.statuses[index];

  const next = useCallback(() => (index + 1 < group.statuses.length ? setIndex(index + 1) : onClose()), [index, group.statuses.length, onClose]);

  useEffect(() => {
    if (!item) return;
    if (!group.owner.isMine) api.markStatusViewed(token, item.statusId).catch(() => undefined);
    if (item.kind === 'VIDEO') return;
    const timer = setTimeout(next, IMAGE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [item, group.owner.isMine, token, next]);

  if (!item) return null;

  const showViewers = async () => {
    try {
      const viewers = await api.getStatusViewers(token, item.statusId);
      Alert.alert(`Viewed by ${viewers.length}`, viewers.map((v) => v.name).join('\n') || 'No views yet');
    } catch (err: any) {
      Alert.alert('Could not load viewers', err?.message);
    }
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.viewer, { backgroundColor: item.kind === 'TEXT' ? item.backgroundColor || COLORS[0] : '#000' }]} onPress={next}>
        <View style={styles.progressRow}>
          {group.statuses.map((s, i) => (
            <View key={s.statusId} style={[styles.progress, { backgroundColor: i <= index ? '#FFF' : '#FFFFFF55' }]} />
          ))}
        </View>
        <View style={styles.viewerHeader}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>{group.owner.name}</Text>
          <Text style={{ color: '#FFFFFFAA', fontSize: 12, marginLeft: 8 }}>{ago(item.createdAt)}</Text>
          <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto', padding: 8 }} accessibilityLabel="Close">
            <Text style={{ color: '#FFF', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
        {item.kind === 'TEXT' ? (
          <Text style={styles.statusText}>{item.text}</Text>
        ) : (
          <>
            <StatusMedia item={item} onEnd={next} />
            {item.text ? <Text style={styles.caption}>{item.text}</Text> : null}
          </>
        )}
        {group.owner.isMine && (
          <View style={styles.ownerBar}>
            <TouchableOpacity onPress={showViewers}>
              <Text style={{ color: '#FFF' }}>👁 {item.viewCount ?? 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                Alert.alert('Delete status?', undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => api.deleteStatus(token, item.statusId).then(onClose) },
                ])
              }
            >
              <Text style={{ color: '#FFF' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </Pressable>
    </Modal>
  );
};

const TextComposer: React.FC<{ visible: boolean; onClose: () => void; onPost: (text: string, color: string) => Promise<void> }> = ({ visible, onClose, onPost }) => {
  const [text, setText] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.viewer, { backgroundColor: color, justifyContent: 'center' }]}>
        <TextInput
          style={styles.statusText}
          value={text}
          onChangeText={setText}
          placeholder="Type a status"
          placeholderTextColor="#FFFFFFAA"
          multiline
          maxLength={700}
          autoFocus
        />
        <View style={styles.colorRow}>
          {COLORS.map((c) => (
            <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c, borderWidth: c === color ? 3 : 1 }]} accessibilityLabel={`Color ${c}`} />
          ))}
        </View>
        <View style={styles.ownerBar}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: '#FFF', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={!text.trim() || busy}
            onPress={async () => {
              setBusy(true);
              try {
                await onPost(text.trim(), color);
                setText('');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>{busy ? 'Posting…' : 'Post'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export const StatusSection: React.FC<{ accessToken: string }> = ({ accessToken }) => {
  const { theme } = useTheme();
  const [feed, setFeed] = useState<api.StatusGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState<api.StatusGroup | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const load = useCallback(() => {
    api.getStatusFeed(accessToken).then(setFeed).catch(() => undefined).finally(() => setIsLoading(false));
  }, [accessToken]);

  useEffect(load, [load]);

  const postMedia = async () => {
    try {
      const picked = await pickFromLibrary();
      if (!picked) return;
      setIsPosting(true);
      const media = await uploadFile(picked.file, picked.kind);
      await api.postStatus(accessToken, { kind: picked.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE', mediaId: media.mediaId });
      load();
    } catch (err: any) {
      Alert.alert('Could not post status', err?.message || 'Please try again.');
    } finally {
      setIsPosting(false);
    }
  };

  const mine = feed.find((g) => g.owner.isMine);
  const others = feed.filter((g) => !g.owner.isMine);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: theme.border }]}
        onPress={() =>
          mine
            ? setOpen(mine)
            : Alert.alert('Add status', undefined, [
                { text: 'Text', onPress: () => setIsWriting(true) },
                { text: 'Photo or video', onPress: postMedia },
                { text: 'Cancel', style: 'cancel' },
              ])
        }
        onLongPress={() =>
          Alert.alert('Add status', undefined, [
            { text: 'Text', onPress: () => setIsWriting(true) },
            { text: 'Photo or video', onPress: postMedia },
            { text: 'Cancel', style: 'cancel' },
          ])
        }
      >
        <Avatar name="Me" size={48} fallback={mine ? '●' : '+'} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>My status</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            {isPosting ? 'Posting…' : mine ? `${mine.statuses.length} update(s) · hold to add another` : 'Tap to add a status update'}
          </Text>
        </View>
      </TouchableOpacity>

      {isLoading && <ActivityIndicator style={{ marginTop: 20 }} color={theme.primary} />}
      {!isLoading && others.length === 0 && (
        <Text style={{ color: theme.textSecondary, padding: 20, textAlign: 'center' }}>No recent updates from your contacts</Text>
      )}
      {others.map((group) => (
        <TouchableOpacity key={group.owner.userOrganizationId} style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => setOpen(group)}>
          <View style={[styles.ring, { borderColor: group.unviewedCount ? theme.primary : theme.border }]}>
            <Avatar name={group.owner.name} mediaId={group.owner.profilePhotoMediaId} size={44} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: theme.text, fontWeight: '600' }}>{group.owner.name}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{ago(group.statuses[group.statuses.length - 1].createdAt)}</Text>
          </View>
        </TouchableOpacity>
      ))}

      {open && (
        <StatusViewer
          token={accessToken}
          group={open}
          onClose={() => {
            setOpen(null);
            load();
          }}
        />
      )}
      <TextComposer
        visible={isWriting}
        onClose={() => setIsWriting(false)}
        onPost={async (text, color) => {
          try {
            await api.postStatus(accessToken, { kind: 'TEXT', text, backgroundColor: color });
            setIsWriting(false);
            load();
          } catch (err: any) {
            Alert.alert('Could not post status', err?.message || 'Please try again.');
          }
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  ring: { borderWidth: 2.5, borderRadius: 26, padding: 2 },
  viewer: { flex: 1, paddingTop: 50, alignItems: 'center' },
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, width: '100%' },
  progress: { flex: 1, height: 3, borderRadius: 2 },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 16, paddingVertical: 10 },
  statusText: { color: '#FFF', fontSize: 28, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24, marginTop: 'auto', marginBottom: 'auto' },
  caption: { color: '#FFF', fontSize: 16, padding: 16, textAlign: 'center' },
  full: { width: '100%', flex: 1 },
  ownerBar: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', padding: 24 },
  colorRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 12 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderColor: '#FFF' },
});

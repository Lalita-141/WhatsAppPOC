import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { socket } from '../../../services/socket';
import { MediaAttachment } from '../../../components/media/MediaAttachment';
import { chooseAttachment } from '../../../components/media/attachmentPicker';
import { uploadFile } from '../../../services/media/mediaService';
import * as api from '../api/updatesApi';

const ChannelScreen: React.FC<{ token: string; channel: api.Channel; onClose: () => void; onChanged: () => void }> = ({ token, channel, onClose, onChanged }) => {
  const { theme } = useTheme();
  const [posts, setPosts] = useState<api.ChannelPost[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const canPost = channel.role === 'OWNER' || channel.role === 'ADMIN';

  const load = useCallback(() => {
    api.getChannelPosts(token, channel.channelId).then((page) => setPosts(page.posts)).catch(() => undefined);
  }, [token, channel.channelId]);

  useEffect(() => {
    load();
    const onPost = (data: { channelId: string }) => data?.channelId === channel.channelId && load();
    socket.on('channel:post:new', onPost);
    return () => {
      socket.off('channel:post:new', onPost);
    };
  }, [load, channel.channelId]);

  const publish = async (mediaId?: string) => {
    setBusy(true);
    try {
      await api.publishPost(token, channel.channelId, { text: text.trim() || undefined, mediaId });
      setText('');
      load();
    } catch (err: any) {
      Alert.alert('Could not post', err?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    try {
      const picked = await chooseAttachment();
      if (!picked) return;
      setBusy(true);
      const media = await uploadFile(picked.file, picked.kind);
      await publish(media.mediaId);
    } catch (err: any) {
      Alert.alert('Could not attach', err?.message || 'Please try again.');
      setBusy(false);
    }
  };

  const menu = () =>
    Alert.alert(channel.name, `${channel.followerCount} followers`, [
      ...(channel.role === 'FOLLOWER'
        ? [
            { text: channel.muted ? 'Unmute' : 'Mute', onPress: () => api.muteChannel(token, channel.channelId, !channel.muted).then(onChanged) },
            { text: 'Unfollow', style: 'destructive' as const, onPress: () => api.unfollowChannel(token, channel.channelId).then(() => { onChanged(); onClose(); }) },
          ]
        : []),
      ...(channel.role === 'OWNER'
        ? [{ text: 'Delete channel', style: 'destructive' as const, onPress: () => api.deleteChannel(token, channel.channelId).then(() => { onChanged(); onClose(); }) }]
        : []),
      { text: 'Close', style: 'cancel' as const },
    ]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Back">
            <Text style={{ color: theme.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{channel.name}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{channel.organizationName} · {channel.followerCount} followers</Text>
          </View>
          <TouchableOpacity onPress={menu} accessibilityLabel="Channel options">
            <Text style={{ color: theme.text, fontSize: 20 }}>⋮</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={posts}
          keyExtractor={(p) => p.postId}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          ListEmptyComponent={<Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No posts yet</Text>}
          renderItem={({ item }) => (
            <View style={[styles.post, { backgroundColor: theme.surface }]}>
              {item.media && <MediaAttachment media={item.media} textColor={theme.text} mutedColor={theme.textSecondary} />}
              {item.text ? <Text style={{ color: theme.text, fontSize: 15 }} selectable>{item.text}</Text> : null}
              <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4, alignSelf: 'flex-end' }}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          )}
        />
        {canPost && (
          <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <TouchableOpacity onPress={attach} disabled={busy} accessibilityLabel="Attach a file" style={{ padding: 6 }}>
              <Text style={{ fontSize: 20 }}>📎</Text>
            </TouchableOpacity>
            <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} value={text} onChangeText={setText} placeholder="Post to followers" placeholderTextColor={theme.placeholder} multiline maxLength={5000} />
            <TouchableOpacity onPress={() => publish()} disabled={!text.trim() || busy} accessibilityLabel="Post">
              <Text style={{ color: text.trim() ? theme.primary : theme.textSecondary, fontWeight: '700', padding: 8 }}>{busy ? '…' : 'Post'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
};

export const ChannelsSection: React.FC<{ accessToken: string }> = ({ accessToken }) => {
  const { theme } = useTheme();
  const [mine, setMine] = useState<api.Channel[]>([]);
  const [discover, setDiscover] = useState<api.Channel[] | null>(null);
  const [open, setOpen] = useState<api.Channel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(() => {
    api.getMyChannels(accessToken).then(setMine).catch(() => undefined).finally(() => setIsLoading(false));
  }, [accessToken]);

  useEffect(() => {
    load();
    socket.on('channel:post:new', load);
    return () => {
      socket.off('channel:post:new', load);
    };
  }, [load]);

  const create = async () => {
    try {
      await api.createChannel(accessToken, newName.trim());
      setNewName('');
      setIsCreating(false);
      load();
    } catch (err: any) {
      Alert.alert('Could not create channel', err?.message || 'Please try again.');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {isLoading && <ActivityIndicator style={{ marginTop: 20 }} color={theme.primary} />}
      {!isLoading && mine.length === 0 && (
        <Text style={{ color: theme.textSecondary, padding: 20, textAlign: 'center' }}>You do not follow any channels yet</Text>
      )}
      {mine.map((c) => (
        <TouchableOpacity key={c.channelId} style={[styles.row, { borderBottomColor: theme.border }]} onPress={() => setOpen(c)}>
          <Text style={{ fontSize: 26, marginRight: 12 }}>📢</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: '600' }}>{c.name}{c.role !== 'FOLLOWER' ? ' (admin)' : ''}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>{c.lastPost?.text || (c.lastPost ? 'Attachment' : c.organizationName)}</Text>
          </View>
          {Boolean(c.unreadCount) && (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>{c.unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}

      <View style={{ flexDirection: 'row', gap: 12, padding: 16 }}>
        <TouchableOpacity style={[styles.button, { borderColor: theme.primary }]} onPress={() => api.discoverChannels(accessToken).then(setDiscover).catch((e) => Alert.alert('Could not load channels', e?.message))}>
          <Text style={{ color: theme.primary, fontWeight: '600' }}>Find channels</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { borderColor: theme.primary }]} onPress={() => setIsCreating(true)}>
          <Text style={{ color: theme.primary, fontWeight: '600' }}>Create channel</Text>
        </TouchableOpacity>
      </View>

      {isCreating && (
        <View style={[styles.inline, { borderColor: theme.border }]}>
          <TextInput style={[styles.input, { color: theme.text, borderColor: theme.border }]} value={newName} onChangeText={setNewName} placeholder="Channel name" placeholderTextColor={theme.placeholder} maxLength={150} autoFocus />
          <TouchableOpacity onPress={create} disabled={!newName.trim()}>
            <Text style={{ color: theme.primary, fontWeight: '700', padding: 8 }}>Create</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={discover !== null} animationType="slide" onRequestClose={() => setDiscover(null)}>
        <View style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 17, flex: 1 }}>Find channels</Text>
            <TouchableOpacity onPress={() => setDiscover(null)}>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={discover ?? []}
            keyExtractor={(c) => c.channelId}
            ListEmptyComponent={<Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 40 }}>No channels available to you</Text>}
            renderItem={({ item }) => (
              <View style={[styles.row, { borderBottomColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{item.organizationName} · {item.followerCount} followers</Text>
                </View>
                {item.role ? (
                  <Text style={{ color: theme.textSecondary }}>{item.role === 'FOLLOWER' ? 'Following' : 'Admin'}</Text>
                ) : (
                  <TouchableOpacity
                    onPress={() =>
                      api.followChannel(accessToken, item.channelId).then(() => {
                        setDiscover((list) => list?.map((c) => (c.channelId === item.channelId ? { ...c, role: 'FOLLOWER' } : c)) ?? null);
                        load();
                      })
                    }
                  >
                    <Text style={{ color: theme.primary, fontWeight: '700' }}>Follow</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </View>
      </Modal>

      {open && <ChannelScreen token={accessToken} channel={open} onClose={() => { setOpen(null); load(); }} onChanged={load} />}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  post: { borderRadius: 10, padding: 12 },
  composer: { flexDirection: 'row', alignItems: 'center', padding: 8, borderTopWidth: 1, gap: 4 },
  input: { flex: 1, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, maxHeight: 100 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  button: { flex: 1, borderWidth: 1, borderRadius: 18, paddingVertical: 8, alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, gap: 8 },
});

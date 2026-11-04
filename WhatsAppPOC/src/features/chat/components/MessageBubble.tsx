import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatMessage, reactionSummary } from '../utils/messageList';
import { MediaAttachment } from '../../../components/media/MediaAttachment';

interface Props {
  message: ChatMessage;
  isDark: boolean;
  isSelfChat: boolean;
  peerName: string;
  isHighlighted?: boolean;
  onLongPress: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onPressReply?: (messageId: string) => void;
}

const formatTime = (value: string) => {
  const date = new Date(value);
  return isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const Ticks: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'SENDING':
      return <ActivityIndicator size={10} color="#8696A0" style={{ marginLeft: 4 }} />;
    case 'FAILED':
      return <Text style={[styles.tick, { color: '#E53935' }]}>!</Text>;
    case 'DELIVERED':
      return <Text style={styles.tick}>✓✓</Text>;
    case 'SEEN':
      return <Text style={[styles.tick, { color: '#53BDEB' }]}>✓✓</Text>;
    default:
      return <Text style={styles.tick}>✓</Text>;
  }
};

export const MessageBubble: React.FC<Props> = ({
  message,
  isDark,
  isSelfChat,
  peerName,
  isHighlighted,
  onLongPress,
  onRetry,
  onPressReply,
}) => {
  const mine = message.isMine;
  const text = isDark ? '#E9EDEF' : '#111B21';
  const muted = isDark ? '#8696A0' : '#667781';
  const reactions = reactionSummary(message.reactions);
  const reply = message.replyTo;

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable
        onLongPress={() => !message.isDeleted && message.messageId && onLongPress(message)}
        onPress={() => message.status === 'FAILED' && onRetry(message)}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityHint={message.status === 'FAILED' ? 'Tap to send again' : 'Long press for options'}
        style={[
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleTheirs,
          { backgroundColor: mine ? (isDark ? '#005C4B' : '#D9FDD3') : isDark ? '#202C33' : '#FFFFFF' },
          isHighlighted && styles.highlight,
        ]}
      >
        {message.forwarded && !message.isDeleted && (
          <Text style={[styles.meta, { color: muted }]}>↪ Forwarded</Text>
        )}

        {reply && !message.isDeleted && (
          <Pressable
            onPress={() => onPressReply?.(reply.messageId)}
            style={[styles.quote, { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)' }]}
          >
            <Text style={[styles.quoteName, { color: '#06CF9C' }]} numberOfLines={1}>
              {reply.senderUserOrganizationId === message.senderUserOrganizationId && mine
                ? 'You'
                : reply.senderUserOrganizationId === message.senderUserOrganizationId
                ? peerName
                : mine
                ? peerName
                : 'You'}
            </Text>
            <Text style={{ color: muted, fontSize: 13 }} numberOfLines={2}>
              {reply.isDeleted ? 'This message was deleted' : reply.message}
            </Text>
          </Pressable>
        )}

        {message.isDeleted ? (
          <Text style={[styles.text, styles.deleted, { color: muted }]}>
            🚫 {mine ? 'You deleted this message' : 'This message was deleted'}
          </Text>
        ) : (
          <>
            {message.media && (
              <MediaAttachment
                media={message.media}
                textColor={text}
                mutedColor={muted}
                uploadProgress={message.uploadProgress}
                localUri={message.uploadProgress !== undefined ? message.localFile?.uri : undefined}
              />
            )}
            {Boolean(message.message) && (
              <Text style={[styles.text, { color: text }]} selectable>
                {message.message}
              </Text>
            )}
          </>
        )}

        <View style={styles.footer}>
          {message.isStarred && <Text style={[styles.meta, { color: muted, marginRight: 4 }]}>★</Text>}
          {message.pinnedAt && !message.isDeleted && <Text style={[styles.meta, { color: muted, marginRight: 4 }]}>📌</Text>}
          {message.editedAt && !message.isDeleted && <Text style={[styles.meta, { color: muted, marginRight: 4 }]}>Edited</Text>}
          <Text style={[styles.meta, { color: muted }]}>{formatTime(message.sendTime)}</Text>
          {mine && (!isSelfChat || message.status === 'SENDING' || message.status === 'FAILED') && (
            <Ticks status={String(message.status)} />
          )}
        </View>

        {message.status === 'FAILED' && (
          <Text style={[styles.meta, { color: '#E53935', marginTop: 2 }]}>Not sent. Tap to retry.</Text>
        )}
      </Pressable>

      {reactions.length > 0 && (
        <View style={[styles.reactions, mine ? { right: 8 } : { left: 8 }, { backgroundColor: isDark ? '#202C33' : '#FFFFFF' }]}>
          {reactions.map(([emoji, count]) => (
            <Text key={emoji} style={styles.reactionText}>
              {emoji}
              {count > 1 ? ` ${count}` : ''}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { marginVertical: 4, flexDirection: 'row', paddingBottom: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  bubbleMine: { borderTopRightRadius: 2 },
  bubbleTheirs: { borderTopLeftRadius: 2 },
  highlight: { borderWidth: 2, borderColor: '#53BDEB' },
  quote: { borderLeftWidth: 4, borderLeftColor: '#06CF9C', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 },
  quoteName: { fontSize: 12, fontWeight: '700' },
  text: { fontSize: 15, lineHeight: 20 },
  deleted: { fontStyle: 'italic' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
  meta: { fontSize: 11 },
  tick: { fontSize: 11, marginLeft: 3, color: '#8696A0' },
  reactions: {
    position: 'absolute',
    bottom: -10,
    flexDirection: 'row',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 1,
    gap: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  reactionText: { fontSize: 13 },
});

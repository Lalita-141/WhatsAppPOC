import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { canDeleteForEveryone, canEdit, ChatMessage } from '../utils/messageList';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export type MessageAction =
  | 'reply'
  | 'forward'
  | 'star'
  | 'unstar'
  | 'pin'
  | 'unpin'
  | 'edit'
  | 'deleteForMe'
  | 'deleteForEveryone'
  | 'report';

interface Props {
  message: ChatMessage | null;
  myReaction?: string | null;
  isSelfChat: boolean;
  onClose: () => void;
  onReact: (message: ChatMessage, emoji: string | null) => void;
  onAction: (message: ChatMessage, action: MessageAction) => void;
}

export const MessageActionSheet: React.FC<Props> = ({ message, myReaction, isSelfChat, onClose, onReact, onAction }) => {
  const { theme } = useTheme();

  if (!message) {
    return null;
  }

  const actions: { key: MessageAction; label: string; danger?: boolean }[] = [
    { key: 'reply', label: 'Reply' },
    { key: 'forward', label: 'Forward' },
    message.isStarred ? { key: 'unstar', label: 'Unstar' } : { key: 'star', label: 'Star' },
    message.pinnedAt ? { key: 'unpin', label: 'Unpin' } : { key: 'pin', label: 'Pin' },
    ...(canEdit(message) ? [{ key: 'edit' as const, label: 'Edit' }] : []),
    { key: 'deleteForMe', label: 'Delete for me', danger: true },
    ...(canDeleteForEveryone(message) && !isSelfChat
      ? [{ key: 'deleteForEveryone' as const, label: 'Delete for everyone', danger: true }]
      : []),
    ...(!message.isMine && !isSelfChat ? [{ key: 'report' as const, label: 'Report', danger: true }] : []),
  ];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.reactions}>
            {QUICK_REACTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                accessibilityLabel={`React ${emoji}`}
                style={[styles.reaction, myReaction === emoji && { backgroundColor: theme.border }]}
                onPress={() => onReact(message, myReaction === emoji ? null : emoji)}
              >
                <Text style={{ fontSize: 26 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[styles.action, { borderTopColor: theme.border }]}
              onPress={() => onAction(message, action.key)}
            >
              <Text style={{ color: action.danger ? theme.error : theme.text, fontSize: 16 }}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24, paddingTop: 12 },
  reactions: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingBottom: 12 },
  reaction: { padding: 6, borderRadius: 20 },
  action: { paddingVertical: 14, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth },
});

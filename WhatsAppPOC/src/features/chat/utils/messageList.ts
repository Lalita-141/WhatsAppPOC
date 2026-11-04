import { ApiChatMessage } from '../api/chatApi';
import { LocalFile } from '../../../services/media/mediaService';

/** A message on screen. Unsent ones have no messageId yet. */
export interface ChatMessage extends Omit<ApiChatMessage, 'messageId'> {
  localId: string;
  messageId?: string;
  /** While an attachment uploads: progress from 0 to 1, and the file to retry with. */
  uploadProgress?: number;
  localFile?: LocalFile;
}

export type ChatRow<T extends Mergeable = ChatMessage> =
  | { type: 'date'; key: string; label: string }
  | { type: 'message'; key: string; message: T };

/** Letters, digits and dashes, as the server requires. */
export const newClientMessageId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

export const fromServer = (message: ApiChatMessage): ChatMessage => ({
  ...message,
  localId: message.messageId,
});

/** The other person in the chat this message belongs to, from the viewer's side. */
export const peerOf = (message: Pick<ApiChatMessage, 'isMine' | 'senderUserOrganizationId' | 'receiverUserOrganizationId'>) =>
  message.isMine ? message.receiverUserOrganizationId : message.senderUserOrganizationId;

const compareIds = (a: string, b: string) => {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
};

// Saved messages in server order; unsent ones after them in the order typed.
const compareMessages = (a: Mergeable, b: Mergeable) => {
  if (a.messageId && b.messageId) return compareIds(a.messageId, b.messageId);
  if (a.messageId) return -1;
  if (b.messageId) return 1;
  return new Date(a.sendTime).getTime() - new Date(b.sendTime).getTime();
};

/**
 * Adds or replaces messages. A server copy replaces the optimistic bubble with
 * the same clientMessageId, so a send never shows twice, even when the
 * acknowledgement and the sync of another device arrive in either order.
 */
export interface Mergeable {
  localId: string;
  messageId?: string;
  clientMessageId?: string | null;
  sendTime: string;
}

export const mergeMessages = <T extends Mergeable>(current: T[], incoming: T[]): T[] => {
  const result = [...current];

  for (const message of incoming) {
    const index = result.findIndex(
      (item) =>
        (message.messageId && item.messageId === message.messageId) ||
        (message.clientMessageId && item.clientMessageId === message.clientMessageId),
    );

    if (index === -1) {
      result.push(message);
    } else {
      result[index] = { ...result[index], ...message, localId: message.messageId ?? result[index].localId };
    }
  }

  return result.sort(compareMessages);
};

export const updateMessage = <T extends Mergeable>(
  current: T[],
  match: (message: T) => boolean,
  change: (message: T) => Partial<T>,
) => current.map((message) => (match(message) ? { ...message, ...change(message) } : message));

export const removeMessage = <T extends Mergeable>(current: T[], messageId: string) =>
  current.filter((message) => message.messageId !== messageId);

const dayLabel = (date: Date, now = new Date()) => {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
};

/** Messages with a date row before the first message of each day. */
export const withDateSeparators = <T extends Mergeable>(messages: T[], now = new Date()): ChatRow<T>[] => {
  const rows: ChatRow<T>[] = [];
  let lastDay = '';

  for (const message of messages) {
    const date = new Date(message.sendTime);
    const day = isNaN(date.getTime()) ? '' : date.toDateString();

    if (day && day !== lastDay) {
      rows.push({ type: 'date', key: `date-${day}`, label: dayLabel(date, now) });
      lastDay = day;
    }
    rows.push({ type: 'message', key: message.localId, message });
  }

  return rows;
};

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETE_FOR_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000;

const age = (message: ChatMessage, now: number) => now - new Date(message.sendTime).getTime();

export const canEdit = (message: ChatMessage, now = Date.now()) =>
  message.isMine && Boolean(message.messageId) && !message.isDeleted && age(message, now) <= EDIT_WINDOW_MS;

export const canDeleteForEveryone = (message: ChatMessage, now = Date.now()) =>
  message.isMine && Boolean(message.messageId) && !message.isDeleted && age(message, now) <= DELETE_FOR_EVERYONE_WINDOW_MS;

/** Groups reactions for display: [["👍", 2], ["❤️", 1]]. */
export const reactionSummary = (reactions: ChatMessage['reactions'] = []) => {
  const counts = new Map<string, number>();
  reactions.forEach(({ emoji }) => counts.set(emoji, (counts.get(emoji) ?? 0) + 1));
  return [...counts.entries()];
};

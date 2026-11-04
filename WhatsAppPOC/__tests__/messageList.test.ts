import {
  canDeleteForEveryone,
  canEdit,
  ChatMessage,
  mergeMessages,
  newClientMessageId,
  peerOf,
  reactionSummary,
  withDateSeparators,
} from '../src/features/chat/utils/messageList';

const base = (over: Partial<ChatMessage>): ChatMessage => ({
  localId: over.messageId ?? 'local',
  senderUserOrganizationId: '1',
  receiverUserOrganizationId: '2',
  message: 'hi',
  sendTime: '2026-11-03T10:00:00.000Z',
  status: 'SENT',
  isMine: true,
  ...over,
});

describe('message list', () => {
  it('replaces an optimistic bubble with the server copy by client ID', () => {
    const optimistic = base({ localId: 'local-a', clientMessageId: 'abcdefgh1', status: 'SENDING' });
    const merged = mergeMessages([optimistic], [base({ messageId: '10', clientMessageId: 'abcdefgh1' })]);

    expect(merged).toHaveLength(1);
    expect(merged[0].messageId).toBe('10');
    expect(merged[0].status).toBe('SENT');
  });

  it('keeps two identical texts apart, unlike matching by text', () => {
    const first = base({ localId: 'l1', clientMessageId: 'client-1aa', status: 'SENDING', message: 'ok' });
    const second = base({ localId: 'l2', clientMessageId: 'client-2bb', status: 'SENDING', message: 'ok' });
    const merged = mergeMessages([first, second], [base({ messageId: '11', clientMessageId: 'client-2bb', message: 'ok' })]);

    expect(merged.find((m) => m.clientMessageId === 'client-1aa')?.status).toBe('SENDING');
    expect(merged.find((m) => m.clientMessageId === 'client-2bb')?.messageId).toBe('11');
  });

  it('orders by server ID, numerically, with unsent messages last', () => {
    const merged = mergeMessages([], [
      base({ messageId: '100' }),
      base({ localId: 'pending', clientMessageId: 'pending-01', status: 'SENDING' }),
      base({ messageId: '99' }),
    ]);
    expect(merged.map((m) => m.messageId ?? 'pending')).toEqual(['99', '100', 'pending']);
  });

  it('ignores a duplicate delivery of the same message', () => {
    const once = mergeMessages([], [base({ messageId: '5' })]);
    expect(mergeMessages(once, [base({ messageId: '5' })])).toHaveLength(1);
  });

  it('finds the chat a message belongs to from either side', () => {
    expect(peerOf({ isMine: true, senderUserOrganizationId: '1', receiverUserOrganizationId: '2' })).toBe('2');
    expect(peerOf({ isMine: false, senderUserOrganizationId: '2', receiverUserOrganizationId: '1' })).toBe('2');
  });

  it('adds one date row per day', () => {
    const rows = withDateSeparators(
      [
        base({ messageId: '1', sendTime: '2026-11-02T10:00:00' }),
        base({ messageId: '2', sendTime: '2026-11-03T09:00:00' }),
        base({ messageId: '3', sendTime: '2026-11-03T11:00:00' }),
      ],
      new Date('2026-11-03T12:00:00'),
    );
    expect(rows.map((r) => (r.type === 'date' ? r.label : r.message.messageId))).toEqual(['Yesterday', '1', 'Today', '2', '3']);
  });

  it('allows edit for 15 minutes and delete for everyone for 48 hours, own messages only', () => {
    const now = new Date('2026-11-03T10:20:00.000Z').getTime();
    const mine = base({ messageId: '1' });
    expect(canEdit(mine, now)).toBe(false);
    expect(canDeleteForEveryone(mine, now)).toBe(true);
    expect(canEdit({ ...mine, sendTime: '2026-11-03T10:10:00.000Z' }, now)).toBe(true);
    expect(canDeleteForEveryone({ ...mine, isMine: false }, now)).toBe(false);
  });

  it('summarizes reactions and makes valid client IDs', () => {
    expect(reactionSummary([
      { emoji: '👍', userOrganizationId: '1' },
      { emoji: '👍', userOrganizationId: '2' },
      { emoji: '❤️', userOrganizationId: '3' },
    ])).toEqual([['👍', 2], ['❤️', 1]]);
    expect(newClientMessageId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChatScreen } from '../src/features/chat/screens/ChatScreen';
import { socket } from '../src/services/socket';

jest.mock('../src/core/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));

const mockHistory = jest.fn();
jest.mock('../src/features/chat/api/chatApi', () => ({
  getPersonalChatHistory: (...args: unknown[]) => mockHistory(...args),
  getPinnedMessages: jest.fn(async () => []),
  deleteMessage: jest.fn(async () => ({})),
  editMessage: jest.fn(),
  forwardMessage: jest.fn(),
  setReaction: jest.fn(),
  setStarred: jest.fn(),
  setPinned: jest.fn(),
  searchMessages: jest.fn(),
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
  reportUser: jest.fn(),
  updateConversation: jest.fn(),
}));

jest.mock('../src/features/chat/api/chatQueries', () => ({
  useConversationsQuery: () => ({ data: [], isLoading: false }),
}));

const mockSocket = socket as unknown as {
  connected: boolean;
  emit: jest.Mock;
  trigger: (event: string, payload: unknown) => Promise<unknown>;
};

const server = (over: Record<string, unknown>) => ({
  senderUserOrganizationId: '1',
  receiverUserOrganizationId: '2',
  message: 'hi',
  sendTime: new Date().toISOString(),
  status: 'SENT',
  isMine: true,
  reactions: [],
  ...over,
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  mounted.splice(0).forEach((renderer) => act(() => renderer.unmount()));
});

const render = async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ChatScreen apiBaseUrl="" accessToken="token" recipient={{ userOrganizationId: '2', name: 'Bob' }} onBack={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  mounted.push(renderer);
  return renderer;
};

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));

const type = async (renderer: ReactTestRenderer.ReactTestRenderer, value: string) => {
  const input = renderer.root.findAllByType(TextInput).find((node) => node.props.placeholder === 'Message')!;
  await act(async () => input.props.onChangeText(value));
  const send = renderer.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityLabel === 'Send')!;
  await act(async () => send.props.onPress());
};

const sentPayloads = () => mockSocket.emit.mock.calls.filter(([event]) => event === 'message:send').map(([, payload]) => payload);

beforeEach(() => {
  jest.clearAllMocks();
  mockSocket.connected = true;
  mockHistory.mockResolvedValue({ messages: [], pagination: { limit: 30, hasMore: false } });
});

describe('chat screen', () => {
  it('sends with a client ID and replaces the bubble with the acknowledgement', async () => {
    const renderer = await render();
    await type(renderer, 'hello');

    const [payload] = sentPayloads();
    expect(payload).toMatchObject({ receiverUserOrganizationId: '2', message: 'hello' });
    expect(payload.clientMessageId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);

    await act(async () => {
      await mockSocket.trigger('message:sent', server({ messageId: '50', clientMessageId: payload.clientMessageId, message: 'hello' }));
    });
    expect(texts(renderer).filter((t) => t === 'hello')).toHaveLength(1);
  });

  it('marks a refused send as failed and retries with the same client ID', async () => {
    const renderer = await render();
    await type(renderer, 'retry me');
    const [first] = sentPayloads();

    await act(async () => {
      await mockSocket.trigger('message:error', { clientMessageId: first.clientMessageId, message: 'Network' });
    });
    expect(texts(renderer)).toContain('Not sent. Tap to retry.');

    const [failed] = renderer.root.findAll(
      (node) => node.props.accessibilityHint === 'Tap to send again' && typeof node.props.onPress === 'function',
    );
    await act(async () => failed.props.onPress());

    const payloads = sentPayloads();
    expect(payloads).toHaveLength(2);
    expect(payloads[1].clientMessageId).toBe(first.clientMessageId);
  });

  it('ignores messages from other chats and acknowledges this one', async () => {
    const renderer = await render();

    await act(async () => {
      await mockSocket.trigger('message:new', server({ messageId: '60', senderUserOrganizationId: '9', receiverUserOrganizationId: '1', isMine: false, message: 'elsewhere' }));
      await mockSocket.trigger('message:new', server({ messageId: '61', senderUserOrganizationId: '2', receiverUserOrganizationId: '1', isMine: false, message: 'for this chat' }));
    });

    expect(texts(renderer)).not.toContain('elsewhere');
    expect(texts(renderer)).toContain('for this chat');
    expect(mockSocket.emit).toHaveBeenCalledWith('message:delivered', { messageIds: ['61'] });
    expect(mockSocket.emit).toHaveBeenCalledWith('message:read', { otherUserOrganizationId: '2' });
  });

  it('marks only the listed messages as seen', async () => {
    mockHistory.mockResolvedValue({
      messages: [server({ messageId: '1', message: 'first', status: 'DELIVERED' }), server({ messageId: '2', message: 'second', status: 'DELIVERED' })],
      pagination: { limit: 30, hasMore: false },
    });
    const renderer = await render();

    await act(async () => {
      await mockSocket.trigger('message:read', { messageIds: ['2'], readerUserOrganizationId: '2' });
    });

    const ticks = renderer.root.findAllByType(Text).filter((node) => node.props.children === '✓✓');
    const colors = ticks.map((node) => StyleSheet.flatten(node.props.style).color);
    expect(colors).toEqual(['#8696A0', '#53BDEB']);
  });

  it('shows a deleted message as deleted, without its text', async () => {
    const renderer = await render();
    await act(async () => {
      await mockSocket.trigger('message:new', server({ messageId: '70', senderUserOrganizationId: '2', receiverUserOrganizationId: '1', isMine: false, message: 'oops' }));
      await mockSocket.trigger('message:updated', {
        reason: 'deleted',
        message: server({ messageId: '70', senderUserOrganizationId: '2', receiverUserOrganizationId: '1', isMine: false, message: null, isDeleted: true }),
      });
    });

    expect(texts(renderer)).not.toContain('oops');
    expect(texts(renderer).some((t) => t.includes('This message was deleted'))).toBe(true);
  });

  it('does not claim end-to-end encryption', async () => {
    const renderer = await render();
    expect(texts(renderer).some((t) => /end-to-end/i.test(t))).toBe(false);
  });
});

describe('chat screen without a connection', () => {
  it('says it is connecting and turns an unsent message into a retry after 15 seconds', async () => {
    jest.useFakeTimers();
    mockSocket.connected = false;
    const renderer = await render();
    expect(texts(renderer).some((t) => t.startsWith('Connecting…'))).toBe(true);

    await type(renderer, 'offline hello');
    expect(sentPayloads()).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    expect(texts(renderer)).toContain('Not sent. Tap to retry.');
    jest.useRealTimers();
  });
});

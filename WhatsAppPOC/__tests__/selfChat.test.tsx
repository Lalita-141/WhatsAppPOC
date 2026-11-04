import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ChatsTab } from '../src/features/dashboard/screens/tabs/ChatsTab';

const mockEmit = jest.fn();
const mockHandlers: Record<string, (message: any) => void> = {};
const mockRefetch = jest.fn();
let mockConversations: any[] = [];

jest.mock('../src/services/socket', () => ({
  socket: {
    emit: (...args: unknown[]) => mockEmit(...args),
    on: (event: string, handler: (message: any) => void) => {
      mockHandlers[event] = handler;
    },
    off: jest.fn(),
  },
  connectSocket: jest.fn(),
}));

jest.mock('../src/features/chat/api/chatQueries', () => ({
  useConversationsQuery: () => ({
    data: mockConversations,
    isLoading: false,
    isRefetching: false,
    error: null,
    refetch: mockRefetch,
  }),
}));

jest.mock('../src/features/group/api/groupApi', () => ({
  listGroups: jest.fn(async () => []),
  setGroupPreferences: jest.fn(),
}));

jest.mock('../src/core/theme', () => ({
  useTheme: () => ({
    theme: new Proxy({}, { get: () => '#000000' }),
    isDark: false,
  }),
}));

const selfConversation = {
  userOrganizationId: '7',
  userId: '1',
  name: 'Asha Rao',
  firstName: 'Asha',
  mobileNo: '9000000000',
  isSelf: true,
  lastMessage: null,
  unreadCount: 0,
};

const texts = (root: ReactTestRenderer.ReactTestInstance) =>
  root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

const render = (props: Partial<React.ComponentProps<typeof ChatsTab>> = {}) => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<ChatsTab accessToken="token" {...props} />);
  });
  return renderer!;
};

describe('self-chat in the chat list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConversations = [selfConversation];
  });

  it('shows "You" with a hint before the first message', () => {
    const shown = texts(render().root);

    expect(shown).toContain('You');
    expect(shown).toContain('Message yourself');
    expect(shown).not.toContain('Asha Rao');
  });

  it('shows no delivery ticks on the last self message', () => {
    mockConversations = [
      {
        ...selfConversation,
        lastMessage: { message: 'buy milk', status: 'SEEN', sendTime: new Date().toISOString() },
      },
    ];
    const shown = texts(render().root);

    expect(shown).toContain('buy milk');
    expect(shown.some(text => text.includes('✓'))).toBe(false);
  });

  it('opens the chat marked as a self-chat', () => {
    const onOpenChat = jest.fn();
    const { root } = render({ onOpenChat });
    const row = root
      .findAllByType(TouchableOpacity)
      .find(node => node.findAllByType(Text).some(text => text.props.children === 'You'));

    act(() => row!.props.onPress());

    expect(onOpenChat.mock.calls[0][0]).toMatchObject({
      userOrganizationId: '7',
      name: 'You',
      isSelf: true,
    });
  });

  it('does not report delivery for a self message synced from another device', () => {
    render();

    act(() =>
      mockHandlers['message:new']({
        messageId: '1',
        senderUserOrganizationId: '7',
        receiverUserOrganizationId: '7',
        isMine: true,
        status: 'SEEN',
      }),
    );

    expect(mockEmit).not.toHaveBeenCalledWith('message:delivered', expect.anything());
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('still reports delivery for a message from someone else', () => {
    render();

    act(() =>
      mockHandlers['message:new']({
        messageId: '2',
        senderUserOrganizationId: '8',
        receiverUserOrganizationId: '7',
        isMine: false,
        status: 'SENT',
      }),
    );

    expect(mockEmit).toHaveBeenCalledWith('message:delivered', { messageId: '2' });
  });
});

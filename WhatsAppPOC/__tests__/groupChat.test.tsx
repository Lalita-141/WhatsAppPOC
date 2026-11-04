import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GroupChatScreen } from '../src/features/group/screens/GroupChatScreen';
import { socket } from '../src/services/socket';
import * as api from '../src/features/group/api/groupApi';

jest.mock('../src/core/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));
jest.mock('../src/features/group/screens/GroupInfoModal', () => ({ GroupInfoModal: () => null }));
jest.mock('../src/features/chat/components/ForwardPicker', () => ({ ForwardPicker: () => null }));
jest.mock('../src/features/group/api/groupApi', () => ({
  getGroup: jest.fn(),
  getGroupMessages: jest.fn(),
  getReceipts: jest.fn(),
  deleteGroupMessage: jest.fn(),
  forwardGroupMessage: jest.fn(),
}));

const mocked = api as jest.Mocked<typeof api>;
const mockSocket = socket as unknown as { connected: boolean; emit: jest.Mock; trigger: (e: string, p: unknown) => Promise<unknown> };

const info = (over: Partial<api.GroupInfo> = {}): api.GroupInfo => ({
  groupId: '5',
  name: 'Team',
  description: null,
  icon: null,
  lastMessage: null,
  unreadCount: 0,
  isAdmin: false,
  isPinned: false,
  isArchived: false,
  mutedUntil: null,
  onlyAdminsCanSend: false,
  onlyAdminsCanEditInfo: false,
  inviteCode: null,
  createdAt: '',
  members: [{ userOrganizationId: '2', name: 'Bob', role: 'USER', organizationName: null, isSuspended: false, isYou: false }],
  ...over,
});

const message = (over: Partial<api.GroupMessage>): api.GroupMessage => ({
  messageId: '1',
  groupId: '5',
  senderUserOrganizationId: '2',
  senderName: 'Bob',
  message: 'hi',
  messageType: 'TEXT',
  sendTime: new Date().toISOString(),
  isMine: false,
  forwarded: false,
  isDeleted: false,
  status: 'SENT',
  replyTo: null,
  ...over,
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => mounted.splice(0).forEach((r) => act(() => r.unmount())));

const render = async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <GroupChatScreen accessToken="token" groupId="5" initialName="Team" onBack={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  mounted.push(renderer);
  return renderer;
};

const texts = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));

beforeEach(() => {
  jest.clearAllMocks();
  mockSocket.connected = true;
  mocked.getGroup.mockResolvedValue(info());
  mocked.getGroupMessages.mockResolvedValue({
    messages: [message({ messageId: '1', messageType: 'SYSTEM', message: 'Asha created the group "Team"', senderName: 'Asha' }), message({ messageId: '2', message: 'hello all' })],
    pagination: { hasMore: false, nextCursor: null },
  });
});

describe('group chat', () => {
  it('shows sender names and group notices, and marks the group read', async () => {
    const r = await render();
    expect(texts(r)).toContain('Bob');
    expect(texts(r)).toContain('Asha created the group "Team"');
    expect(mockSocket.emit).toHaveBeenCalledWith('group:message:read', { groupId: '5' });
  });

  it('sends with a client ID and keeps one bubble after the acknowledgement', async () => {
    const r = await render();
    const input = r.root.findAllByType(TextInput)[0];
    await act(async () => input.props.onChangeText('ship it'));
    const send = r.root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === 'Send')!;
    await act(async () => send.props.onPress());

    const payload = mockSocket.emit.mock.calls.find(([e]) => e === 'group:message:send')![1];
    expect(payload).toMatchObject({ groupId: '5', message: 'ship it' });

    await act(async () => {
      await mockSocket.trigger('group:message:sent', message({ messageId: '9', message: 'ship it', isMine: true, clientMessageId: payload.clientMessageId }));
    });
    expect(texts(r).filter((t) => t === 'ship it')).toHaveLength(1);
  });

  it('ignores messages for other groups', async () => {
    const r = await render();
    await act(async () => {
      await mockSocket.trigger('group:message:new', message({ messageId: '20', groupId: '6', message: 'other group' }));
    });
    expect(texts(r)).not.toContain('other group');
  });

  it('replaces the input for members when only admins can send', async () => {
    mocked.getGroup.mockResolvedValue(info({ onlyAdminsCanSend: true }));
    const r = await render();
    expect(r.root.findAllByType(TextInput)).toHaveLength(0);
    expect(texts(r)).toContain('Only admins can send messages');
  });
});

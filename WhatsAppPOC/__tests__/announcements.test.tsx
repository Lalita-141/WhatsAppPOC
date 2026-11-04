import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { AnnouncementsTab } from '../src/features/broadcast/screens/AnnouncementsTab';
import * as api from '../src/features/broadcast/api/broadcastApi';

jest.mock('../src/core/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));

jest.mock('../src/features/broadcast/api/broadcastApi', () => ({
  getInbox: jest.fn(),
  getSent: jest.fn(async () => ({ broadcasts: [] })),
  getTargets: jest.fn(),
  sendBroadcast: jest.fn(),
  getStats: jest.fn(),
  markBroadcastRead: jest.fn(async () => ({})),
  replyToBroadcast: jest.fn(async () => ({})),
}));

const mocked = api as jest.Mocked<typeof api>;

const announcement = (over: Partial<api.ReceivedBroadcast>): api.ReceivedBroadcast => ({
  broadcastId: '1',
  title: 'Holiday',
  message: 'Closed Friday',
  isAnnouncement: true,
  senderUserOrganizationId: '9',
  senderName: 'Admin',
  senderOrganizationName: 'Org A',
  createdAt: new Date().toISOString(),
  readAt: null,
  ...over,
});

const render = async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<AnnouncementsTab accessToken="token" />);
  });
  return renderer;
};

const press = async (renderer: ReactTestRenderer.ReactTestRenderer, text: string) => {
  const button = renderer.root
    .findAllByType(TouchableOpacity)
    .find((node) => node.findAllByType(Text).some((t) => [t.props.children].flat().join('') === text));
  if (!button) throw new Error(`No button ${text}`);
  await act(async () => button.props.onPress());
};

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getTargets.mockResolvedValue({ canSend: false, organizations: [] });
});

describe('announcements', () => {
  it('marks an opened announcement read and offers no reply when replies are off', async () => {
    mocked.getInbox.mockResolvedValue({ broadcasts: [announcement({})], unreadCount: 1 });
    const renderer = await render();

    await press(renderer, 'Holiday');

    expect(mocked.markBroadcastRead).toHaveBeenCalledWith('token', '1');
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('sends a private reply when replies are on', async () => {
    mocked.getInbox.mockResolvedValue({ broadcasts: [announcement({ isAnnouncement: false, title: 'Who can come?' })], unreadCount: 1 });
    const renderer = await render();
    await press(renderer, 'Who can come?');

    const input = renderer.root.findAllByType(TextInput)[0];
    await act(async () => input.props.onChangeText('Me'));
    await press(renderer, 'Send reply');

    expect(mocked.replyToBroadcast).toHaveBeenCalledWith('token', '1', 'Me');
  });

  it('only offers sending to members with permission', async () => {
    mocked.getInbox.mockResolvedValue({ broadcasts: [], unreadCount: 0 });
    const member = await render();
    expect(member.root.findAll((n) => n.props.accessibilityLabel === 'New broadcast')).toHaveLength(0);

    mocked.getTargets.mockResolvedValue({ canSend: true, organizations: [{ organizationId: '1', organizationName: 'Org A', isOwn: true }] });
    const admin = await render();
    expect(admin.root.findAll((n) => n.props.accessibilityLabel === 'New broadcast' && n.props.onPress).length).toBeGreaterThan(0);
  });
});

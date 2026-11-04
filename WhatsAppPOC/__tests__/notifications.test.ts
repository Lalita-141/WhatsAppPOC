import { onMessage, onNotificationOpenedApp } from '@react-native-firebase/messaging';
import { chatKeyOf, setupNotificationListeners } from '../src/services/notificationService';
import { useAuthStore } from '../src/features/auth/store/authStore';

// An access token whose payload says userOrganizationId 7.
const tokenFor = (userOrganizationId: string) =>
  `x.${(globalThis as unknown as { btoa: (s: string) => string }).btoa(JSON.stringify({ userOrganizationId })).replace(/=+$/, '')}.y`;

const handlerOf = (mock: unknown) => (mock as jest.Mock).mock.calls.at(-1)[1];

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ accessToken: tokenFor('7') });
});

describe('notifications', () => {
  it('shows a banner for another chat but nothing for the chat that is open', () => {
    const notices: unknown[] = [];
    setupNotificationListeners(jest.fn(), () => '5', (n) => notices.push(n));
    const foreground = handlerOf(onMessage);

    foreground({ notification: { title: 'Bob', body: 'hi' }, data: { type: 'PERSONAL_CHAT', senderUserOrganizationId: '5', receiverUserOrganizationId: '7' } });
    expect(notices).toHaveLength(0);

    foreground({ notification: { title: 'Carol', body: 'yo' }, data: { type: 'PERSONAL_CHAT', senderUserOrganizationId: '6', receiverUserOrganizationId: '7' } });
    expect(notices).toHaveLength(1);
  });

  it('ignores a late notification for another organization of the same person', () => {
    const notices: unknown[] = [];
    const opened = jest.fn();
    setupNotificationListeners(opened, () => null, (n) => notices.push(n));

    handlerOf(onMessage)({ notification: { title: 'Old org', body: 'x' }, data: { type: 'PERSONAL_CHAT', senderUserOrganizationId: '6', receiverUserOrganizationId: '99' } });
    handlerOf(onNotificationOpenedApp)({ data: { type: 'PERSONAL_CHAT', senderUserOrganizationId: '6', receiverUserOrganizationId: '99' } });

    expect(notices).toHaveLength(0);
    expect(opened).not.toHaveBeenCalled();
  });

  it('opens what a tapped notification is about', () => {
    const opened = jest.fn();
    setupNotificationListeners(opened, () => null);
    handlerOf(onNotificationOpenedApp)({ data: { type: 'GROUP_CHAT', groupId: '3', groupName: 'Team', receiverUserOrganizationId: '7' } });

    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ type: 'GROUP_CHAT', groupId: '3' }));
    expect(chatKeyOf({ type: 'GROUP_CHAT', groupId: '3' })).toBe('group:3');
    expect(chatKeyOf({ type: 'PERSONAL_CHAT', senderUserOrganizationId: '5' })).toBe('5');
  });
});

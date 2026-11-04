import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { StatusSection } from '../src/features/updates/screens/StatusSection';
import { CommunitiesTab } from '../src/features/dashboard/screens/tabs/CommunitiesTab';
import * as api from '../src/features/updates/api/updatesApi';

jest.mock('../src/core/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#000000' }), isDark: false }),
}));
jest.mock('../src/components/media/Avatar', () => ({ Avatar: () => null }));
jest.mock('../src/features/group/api/groupApi', () => ({ listGroups: jest.fn(async () => []) }));
jest.mock('../src/features/updates/api/updatesApi', () => ({
  getStatusFeed: jest.fn(),
  markStatusViewed: jest.fn(async () => ({})),
  getCommunities: jest.fn(),
  joinCommunityGroup: jest.fn(async () => ({})),
}));

const mocked = api as jest.Mocked<typeof api>;
const texts = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const press = async (r: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const button = r.root.findAllByType(TouchableOpacity).find((b) => b.findAllByType(Text).some((t) => [t.props.children].flat().join('') === label));
  if (!button) throw new Error(`No ${label}`);
  await act(async () => button.props.onPress());
};

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => mounted.splice(0).forEach((r) => act(() => r.unmount())));
const render = async (el: React.ReactElement) => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(el);
  });
  mounted.push(r);
  return r;
};

describe('status', () => {
  it('lists contacts with updates and records a view when one is opened', async () => {
    mocked.getStatusFeed.mockResolvedValue([
      {
        owner: { userOrganizationId: '5', name: 'Bob', profilePhotoMediaId: null, isMine: false },
        statuses: [{ statusId: '9', kind: 'TEXT', text: 'Hello', backgroundColor: '#00A884', media: null, createdAt: new Date().toISOString(), expiresAt: '', viewed: false }],
        unviewedCount: 1,
      },
    ]);
    const r = await render(<StatusSection accessToken="t" />);
    expect(texts(r)).toContain('Bob');

    await press(r, 'Bob');
    expect(texts(r)).toContain('Hello');
    expect(mocked.markStatusViewed).toHaveBeenCalledWith('t', '9');
  });
});

describe('communities', () => {
  it('joins a community group and opens it', async () => {
    mocked.getCommunities.mockResolvedValue([
      { communityId: '1', name: 'Engineering', description: null, announcementGroupId: '10', isAdmin: false, groups: [{ groupId: '11', name: 'Mobile', description: null, memberCount: 4, isMember: false }] },
    ]);
    const onOpenGroup = jest.fn();
    const r = await render(<CommunitiesTab accessToken="t" onOpenGroup={onOpenGroup} />);

    await press(r, 'Join');
    expect(mocked.joinCommunityGroup).toHaveBeenCalledWith('t', '1', '11');
    expect(onOpenGroup).toHaveBeenCalledWith('11', 'Mobile');
  });
});

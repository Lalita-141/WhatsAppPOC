import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';
import { MediaInfo } from '../../../services/media/mediaService';

export interface StatusItem {
  statusId: string;
  kind: 'TEXT' | 'IMAGE' | 'VIDEO';
  text: string | null;
  backgroundColor: string | null;
  media: MediaInfo | null;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  viewCount?: number;
}

export interface StatusGroup {
  owner: { userOrganizationId: string; name: string; profilePhotoMediaId: string | null; isMine: boolean };
  statuses: StatusItem[];
  unviewedCount: number;
}

export interface ChannelPost {
  postId: string;
  channelId: string;
  text: string | null;
  media: MediaInfo | null;
  createdAt: string;
}

export interface Channel {
  channelId: string;
  name: string;
  description: string | null;
  organizationName: string;
  role: 'OWNER' | 'ADMIN' | 'FOLLOWER' | null;
  followerCount: number;
  muted?: boolean;
  lastPost?: ChannelPost | null;
  unreadCount?: number;
}

export interface Community {
  communityId: string;
  name: string;
  description: string | null;
  announcementGroupId: string;
  isAdmin: boolean;
  groups: { groupId: string; name: string; description: string | null; memberCount: number; isMember: boolean }[];
}

const data = async (promise: Promise<any>) => (await promise).data;

export const getStatusFeed = (t: string): Promise<StatusGroup[]> => data(fetchApi('GET', apiPath.status, t));
export const postStatus = (t: string, body: { kind: StatusItem['kind']; text?: string; backgroundColor?: string; mediaId?: string }) =>
  data(fetchApi('POST', apiPath.status, t, false, body));
export const markStatusViewed = (t: string, id: string) => fetchApi('POST', `${apiPath.status}/${id}/view`, t);
export const getStatusViewers = (t: string, id: string): Promise<{ userOrganizationId: string; name: string; viewedAt: string }[]> =>
  data(fetchApi('GET', `${apiPath.status}/${id}/viewers`, t));
export const deleteStatus = (t: string, id: string) => fetchApi('DELETE', `${apiPath.status}/${id}`, t);

export const getMyChannels = (t: string): Promise<Channel[]> => data(fetchApi('GET', apiPath.channels, t));
export const discoverChannels = (t: string): Promise<Channel[]> => data(fetchApi('GET', `${apiPath.channels}/discover`, t));
export const createChannel = (t: string, name: string, description?: string): Promise<Channel> => data(fetchApi('POST', apiPath.channels, t, false, { name, description }));
export const followChannel = (t: string, id: string) => fetchApi('POST', `${apiPath.channels}/${id}/follow`, t);
export const unfollowChannel = (t: string, id: string) => fetchApi('DELETE', `${apiPath.channels}/${id}/follow`, t);
export const muteChannel = (t: string, id: string, muted: boolean) => fetchApi('PATCH', `${apiPath.channels}/${id}/mute`, t, false, { muted });
export const getChannelPosts = (t: string, id: string): Promise<{ posts: ChannelPost[]; nextCursor: string | null }> => data(fetchApi('GET', `${apiPath.channels}/${id}/posts`, t));
export const publishPost = (t: string, id: string, body: { text?: string; mediaId?: string }): Promise<ChannelPost> =>
  data(fetchApi('POST', `${apiPath.channels}/${id}/posts`, t, false, body));
export const deleteChannel = (t: string, id: string) => fetchApi('DELETE', `${apiPath.channels}/${id}`, t);

export const getCommunities = (t: string): Promise<Community[]> => data(fetchApi('GET', apiPath.communities, t));
export const createCommunity = (t: string, name: string, groupIds: string[]): Promise<Community> =>
  data(fetchApi('POST', apiPath.communities, t, false, { name, groupIds }));
export const joinCommunityGroup = (t: string, communityId: string, groupId: string) =>
  fetchApi('POST', `${apiPath.communities}/${communityId}/groups/${groupId}/join`, t);
export const addCommunityGroup = (t: string, communityId: string, groupId: string): Promise<Community> =>
  data(fetchApi('POST', `${apiPath.communities}/${communityId}/groups`, t, false, { groupId }));

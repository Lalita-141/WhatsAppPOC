import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { apiOrigin, apiPath } from '../../environments/environment_urls';
import { fetchApi } from '../api/httpService';
import { getLatestAccessToken } from '../auth/authSession';

export type MediaKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT' | 'AVATAR';

export interface MediaInfo {
  mediaId: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  size: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasThumbnail: boolean;
}

export interface LocalFile {
  uri: string;
  name: string;
  type: string;
  size: number;
  durationMs?: number;
}

const stripScheme = (uri: string) => (uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri);

/**
 * Uploads in two steps: the server checks type and size and returns an upload
 * path, then the file is streamed from disk (not loaded into memory) with
 * progress updates.
 */
export const uploadFile = async (
  file: LocalFile,
  kind: MediaKind,
  onProgress?: (fraction: number) => void,
): Promise<MediaInfo> => {
  const token = getLatestAccessToken();
  const started = await fetchApi('POST', apiPath.mediaUploads, token, false, {
    kind,
    mimeType: file.type,
    size: file.size,
    fileName: file.name,
    durationMs: file.durationMs,
  });

  const response = await ReactNativeBlobUtil.fetch(
    'PUT',
    `${apiOrigin}${started.data.uploadPath}`,
    { Authorization: `Bearer ${getLatestAccessToken() || token}`, 'Content-Type': 'application/octet-stream' },
    ReactNativeBlobUtil.wrap(stripScheme(file.uri)),
  ).uploadProgress({ interval: 200 }, (sent, total) => onProgress?.(total > 0 ? sent / total : 0));

  const body = response.json();
  if (response.info().status !== 200) {
    throw new Error(body?.message || 'Upload failed');
  }
  return body.data;
};

// Signed links last ten minutes; keep them a little less to avoid an expired one.
const cache = new Map<string, { url: string; expiresAt: number }>();

export const getMediaUrl = async (mediaId: string, variant: 'original' | 'thumbnail' = 'original') => {
  const key = `${mediaId}:${variant}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt - Date.now() > 60 * 1000) {
    return cached.url;
  }
  const result = await fetchApi('GET', `${apiPath.media}/${mediaId}/url?variant=${variant}`, getLatestAccessToken());
  const url = `${apiOrigin}${result.data.url}`;
  cache.set(key, { url, expiresAt: new Date(result.data.expiresAt).getTime() });
  return url;
};

export const clearMediaUrlCache = () => cache.clear();

/** Downloads to the app's cache with progress, then opens it in the system viewer. */
export const downloadAndOpen = async (media: MediaInfo, onProgress?: (fraction: number) => void) => {
  const url = await getMediaUrl(media.mediaId);
  const extension = media.fileName.includes('.') ? media.fileName.split('.').pop() : undefined;
  const result = await ReactNativeBlobUtil.config({ fileCache: true, appendExt: extension })
    .fetch('GET', url)
    .progress({ interval: 200 }, (received, total) => onProgress?.(Number(total) > 0 ? Number(received) / Number(total) : 0));

  const path = result.path();
  if (Platform.OS === 'ios') {
    await ReactNativeBlobUtil.ios.openDocument(path);
  } else {
    await ReactNativeBlobUtil.android.actionViewIntent(path, media.mimeType);
  }
  return path;
};

export const setProfilePhoto = (mediaId: string | null) =>
  mediaId
    ? fetchApi('PUT', apiPath.userPhoto, getLatestAccessToken(), false, { mediaId })
    : fetchApi('DELETE', apiPath.userPhoto, getLatestAccessToken());

const LABELS: Record<string, string> = {
  IMAGE: '📷 Photo',
  VIDEO: '🎥 Video',
  AUDIO: '🎵 Audio',
  VOICE: '🎤 Voice message',
  DOCUMENT: '📄 Document',
};

/** What to show for a message whose content is an attachment. */
export const attachmentLabel = (messageType?: string) => (messageType ? LABELS[messageType] : undefined);

export const formatBytes = (size: number | null) => {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

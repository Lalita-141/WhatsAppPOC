import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { MediaAttachment } from '../src/components/media/MediaAttachment';
import { attachmentLabel, formatBytes, MediaInfo, uploadFile } from '../src/services/media/mediaService';
import { apiPath } from '../src/environments/environment_urls';

const fetchMock = jest.fn();
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, headers: { get: () => null } });

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});

const doc: MediaInfo = {
  mediaId: '7',
  kind: 'DOCUMENT',
  mimeType: 'application/pdf',
  fileName: 'report.pdf',
  size: 2048,
  width: null,
  height: null,
  durationMs: null,
  hasThumbnail: false,
};

describe('media', () => {
  it('declares the file, then streams it from disk to the upload path', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { data: { mediaId: '7', uploadPath: '/api/v1/media/uploads/7' } }));
    const request: any = (ReactNativeBlobUtil.fetch as jest.Mock)();
    request.uploadProgress.mockImplementationOnce((_options: unknown, onProgress: (s: number, t: number) => void) => {
      onProgress(50, 100);
      return Promise.resolve({ info: () => ({ status: 200 }), json: () => ({ data: doc }) });
    });
    (ReactNativeBlobUtil.fetch as jest.Mock).mockClear();
    const progress: number[] = [];

    const media = await uploadFile({ uri: 'file:///tmp/report.pdf', name: 'report.pdf', type: 'application/pdf', size: 2048 }, 'DOCUMENT', (f) => progress.push(f));

    const [declareUrl, declareOptions] = fetchMock.mock.calls[0];
    expect(declareUrl).toBe(apiPath.mediaUploads);
    expect(JSON.parse(declareOptions.body)).toMatchObject({ kind: 'DOCUMENT', mimeType: 'application/pdf', size: 2048 });
    const [method, url, headers, body] = (ReactNativeBlobUtil.fetch as jest.Mock).mock.calls[0];
    expect(method).toBe('PUT');
    expect(url).toMatch(/\/api\/v1\/media\/uploads\/7$/);
    expect(headers['Content-Type']).toBe('application/octet-stream');
    expect(body).toBe('RNFetchBlob-file:///tmp/report.pdf');
    expect(progress).toEqual([0.5]);
    expect(media.mediaId).toBe('7');
  });

  it('shows upload progress on an unsent document and its size once sent', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<MediaAttachment media={doc} textColor="#000" mutedColor="#666" uploadProgress={0.42} />);
    });
    const shown = () => renderer.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(shown()).toContain('Uploading 42%');

    await act(async () => renderer.update(<MediaAttachment media={doc} textColor="#000" mutedColor="#666" />));
    expect(shown()).toContain('2 KB');
  });

  it('labels attachment-only messages in the chat list', () => {
    expect(attachmentLabel('VOICE')).toBe('🎤 Voice message');
    expect(attachmentLabel('TEXT')).toBeUndefined();
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

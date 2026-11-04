import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker';
import { keepLocalCopy, pick, types } from '@react-native-documents/picker';
import { LocalFile, MediaKind } from '../../services/media/mediaService';

export interface PickedAttachment {
  file: LocalFile;
  kind: MediaKind;
}

// Photos are resized and compressed on the device before upload; the server
// re-encodes them again and removes location data.
const PHOTO_OPTIONS = { maxWidth: 2560, maxHeight: 2560, quality: 0.8 as const };

const fromAsset = (asset: Asset): PickedAttachment | null => {
  if (!asset.uri || !asset.fileSize) return null;
  const isVideo = (asset.type ?? '').startsWith('video/');
  return {
    kind: isVideo ? 'VIDEO' : 'IMAGE',
    file: {
      uri: asset.uri,
      name: asset.fileName ?? (isVideo ? 'video.mp4' : 'photo.jpg'),
      type: asset.type ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      size: asset.fileSize,
      durationMs: asset.duration ? Math.round(asset.duration * 1000) : undefined,
    },
  };
};

const ensureCamera = async () => {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  return result === PermissionsAndroid.RESULTS.GRANTED;
};

export const pickFromLibrary = async (photosOnly = false): Promise<PickedAttachment | null> => {
  const result = await launchImageLibrary({ mediaType: photosOnly ? 'photo' : 'mixed', selectionLimit: 1, videoQuality: 'medium', ...PHOTO_OPTIONS });
  if (result.errorCode) throw new Error(result.errorMessage || 'Could not open the photo library');
  return result.assets?.[0] ? fromAsset(result.assets[0]) : null;
};

export const takeWithCamera = async (): Promise<PickedAttachment | null> => {
  if (!(await ensureCamera())) {
    Alert.alert('Camera permission needed', 'Allow camera access in Settings to take photos.');
    return null;
  }
  const result = await launchCamera({ mediaType: 'mixed', videoQuality: 'medium', durationLimit: 180, ...PHOTO_OPTIONS });
  if (result.errorCode) throw new Error(result.errorMessage || 'Could not open the camera');
  return result.assets?.[0] ? fromAsset(result.assets[0]) : null;
};

export const pickDocument = async (): Promise<PickedAttachment | null> => {
  try {
    const [doc] = await pick({ type: [types.allFiles] });
    if (!doc.size) throw new Error('This file is empty or cannot be read');
    const name = doc.name ?? 'document';
    // A local copy turns Android content:// links into a file that can be streamed.
    const [copy] = await keepLocalCopy({ files: [{ uri: doc.uri, fileName: name }], destination: 'cachesDirectory' });
    if (copy.status !== 'success') throw new Error(copy.copyError || 'Could not read the file');
    return { kind: 'DOCUMENT', file: { uri: copy.localUri, name, type: doc.type ?? 'application/octet-stream', size: doc.size } };
  } catch (error: any) {
    if (error?.code === 'OPERATION_CANCELED') return null;
    throw error;
  }
};

/** Shows the attach menu and returns what the user picked. */
export const chooseAttachment = () =>
  new Promise<PickedAttachment | null>((resolve, reject) => {
    const run = (task: () => Promise<PickedAttachment | null>) => () => task().then(resolve, reject);
    Alert.alert('Attach', undefined, [
      { text: 'Photo or video', onPress: run(() => pickFromLibrary()) },
      { text: 'Camera', onPress: run(takeWithCamera) },
      { text: 'Document', onPress: run(pickDocument) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });

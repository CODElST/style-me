// Living-room photo handling for items.
//
// privacy: photos stay app-private under Documents/wardrobe/ on device.
// The picker's edited (cropped) result is resized and copied there; nothing
// is uploaded as part of normal tagging.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { File, Directory, Paths } from 'expo-file-system';

type Source = 'camera' | 'library';

async function ensurePermissions(source: Source): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  if (source === 'camera') {
    const res = await ImagePicker.requestCameraPermissionsAsync();
    return res.granted;
  }
  const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return res.granted;
}

/** Opens the picker (library or camera) with a 3:4 garment-friendly crop. */
export async function pickPhoto(source: Source): Promise<string | null> {
  const ok = await ensurePermissions(source);
  if (!ok) return null;

  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.9,
  };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

/** Resizes to a wardrobe-friendly size and persists app-privately. */
export async function finalizePhoto(uri: string, id: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri, { maxWidth: 1200 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });

  if (Platform.OS === 'web') return saved.uri;

  const dir = new Directory(Paths.document, 'wardrobe');
  if (!dir.exists) dir.create();
  const dest = new File(dir, `${id}.jpg`);
  await new File(saved.uri).copy(dest);
  return dest.uri;
}

/** Best-effort delete of the stored photo when an item is removed. */
export function deletePhoto(uri: string): void {
  if (Platform.OS === 'web') return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // ignore — cache cleanup by OS is acceptable
  }
}

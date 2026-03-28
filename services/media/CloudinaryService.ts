import axios from 'axios';
import RNFS from 'react-native-fs';
import { CLOUDINARY_CONFIG } from './CloudinaryConfig';

const BASE_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.CLOUD_NAME}`;

/**
 * [Legacy] Uploads a JPEG from a local file URI.
 * Used for profile photos and other non-E2EE media.
 */
export const uploadToCloudinary = async (fileUri: string): Promise<string | null> => {
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: 'image/jpeg',
      name: 'upload.jpg',
    } as any);
    formData.append('upload_preset', CLOUDINARY_CONFIG.UPLOAD_PRESET);

    const response = await axios.post(
      `${BASE_URL}/image/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );

    if (response.data?.secure_url) {
      console.log('[Cloudinary] Upload success:', response.data.secure_url);
      return response.data.secure_url;
    }
    return null;
  } catch (error) {
    console.error('[Cloudinary] Upload failed:', error);
    return null;
  }
};

/**
 * Uploads an encrypted binary blob as a RAW resource to Cloudinary.
 *
 * Strategy: Write base64 ciphertext to a TEMP FILE, then upload that file
 * using standard multipart form — this avoids the `data:` URI issues
 * (slashes in MIME type cause "Display name cannot contain slashes").
 *
 * @param base64Data  Base64-encoded ciphertext bytes
 * @param _folder     Ignored — folder is managed by the Cloudinary upload preset
 * @param filename    Unique ID for the blob (e.g. msgId_full / msgId_thumb)
 * @returns           The secure_url of the raw blob on Cloudinary
 */
export const uploadEncryptedBlob = async (
  base64Data: string,
  _folder: string,
  filename: string
): Promise<string | null> => {
  // Write to temp file first — avoids data URI slash issues
  const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  const tempPath = `${RNFS.CachesDirectoryPath}/${safeName}.enc`;

  try {
    // 1. Write encrypted base64 blob to a temp file
    await RNFS.writeFile(tempPath, base64Data, 'base64');

    // 2. Upload via standard multipart — same pattern as uploadToCloudinary
    const formData = new FormData();
    formData.append('file', {
      uri: `file://${tempPath}`,
      type: 'application/octet-stream',
      name: `${safeName}.enc`,
    } as any);
    formData.append('upload_preset', CLOUDINARY_CONFIG.RAW_UPLOAD_PRESET);

    const response = await axios.post(
      `${BASE_URL}/raw/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );

    // 3. Cleanup temp file
    await RNFS.unlink(tempPath).catch(() => {});

    if (response.data?.secure_url) {
      console.log('[Cloudinary] Encrypted blob uploaded:', response.data.secure_url);
      return response.data.secure_url;
    }

    console.error('[Cloudinary] No secure_url in response:', response.data);
    return null;
  } catch (error: any) {
    // Cleanup temp file on error too
    await RNFS.unlink(tempPath).catch(() => {});
    console.error('[Cloudinary] Encrypted blob upload failed:', error.response?.data || error.message);
    return null;
  }
};

/**
 * Downloads a raw blob URL and returns its content as a base64 string.
 * Used by the receiver to fetch an encrypted image blob from Cloudinary.
 */
export const downloadBlobAsBase64 = async (url: string): Promise<string | null> => {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    // Convert ArrayBuffer → base64
    const bytes = new Uint8Array(response.data);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (error) {
    console.error('[Cloudinary] Blob download failed:', error);
    return null;
  }
};

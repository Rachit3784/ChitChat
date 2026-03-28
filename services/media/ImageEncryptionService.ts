/**
 * ImageEncryptionService.ts
 *
 * Core service for WhatsApp-style E2EE image handling in ChitChat.
 *
 * Architecture:
 *  1. Sender picks image → compress full + thumbnail JPEG
 *  2. Generate fresh AES-256-GCM key per image (never leaves the device unencrypted)
 *  3. Encrypt image bytes with that AES key
 *  4. Wrap the AES key with the Curve25519 shared-secret (existing E2EE system)
 *  5. Upload encrypted blobs to Cloudinary (Cloudinary sees only opaque bytes)
 *  6. Store wrapped keys + Cloudinary URLs in RTDB message
 *
 *  Receiver:
 *  1. Receives RTDB message with wrapped key + Cloudinary URL
 *  2. Unwrap AES key with shared secret
 *  3. Download cipher blob → decrypt bytes → display
 *  4. Save to local gallery / SQLite cache
 */

import { launchImageLibrary, launchCamera, ImagePickerResponse, Asset } from 'react-native-image-picker';
import forge from 'node-forge';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { uploadEncryptedBlob, downloadBlobAsBase64 } from './CloudinaryService';
import { CLOUDINARY_CONFIG } from './CloudinaryConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EncryptedImagePayload {
  /** Cloudinary URL for the encrypted full-size image blob */
  fullUrl: string;
  /** Cloudinary URL for the encrypted thumbnail blob */
  thumbUrl: string;
  /** AES-256-GCM key for the full image, encrypted with E2EE shared secret — base64 */
  encImgKey: string;
  /** AES-GCM IV for the full image key encryption — base64 */
  encImgKeyIv: string;
  /** AES-256-GCM key for the thumbnail, encrypted with E2EE shared secret — base64 */
  encThumbKey: string;
  /** AES-GCM IV for the thumbnail key encryption — base64 */
  encThumbKeyIv: string;
  /** Original image width in pixels */
  width: number;
  /** Original image height in pixels */
  height: number;
  /** File size in bytes (approximate, of compressed full image) */
  fileSize: number;
}

export interface DecryptedImageResult {
  /** Base64-encoded JPEG — ready for Image source={{ uri: 'data:image/jpeg;base64,...' }} */
  base64: string;
  /** Local file path after saving to cache */
  localPath: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHITCHAT_DIR =
  Platform.OS === 'android'
    ? `${RNFS.ExternalStorageDirectoryPath}/Pictures/ChitChat`
    : `${RNFS.DocumentDirectoryPath}/ChitChat`;

const CACHE_DIR = `${RNFS.CachesDirectoryPath}/chitchat_images`;

// ─── Service ──────────────────────────────────────────────────────────────────

class ImageEncryptionService {

  // ── Image Picker ─────────────────────────────────────────────────────────

  /**
   * Opens the native image gallery picker.
   * Returns the local file URI or null if cancelled.
   */
  public pickImageFromGallery(): Promise<Asset | null> {
    return new Promise((resolve) => {
      launchImageLibrary(
        {
          mediaType: 'photo',
          quality: 0.9,
          maxWidth: 1920,
          maxHeight: 1920,
          includeBase64: false,
        },
        (response: ImagePickerResponse) => {
          if (response.didCancel || response.errorCode || !response.assets?.length) {
            resolve(null);
          } else {
            resolve(response.assets[0]);
          }
        }
      );
    });
  }

  /**
   * Opens the native camera.
   * Returns the captured asset or null if cancelled.
   */
  public pickImageFromCamera(): Promise<Asset | null> {
    return new Promise((resolve) => {
      launchCamera(
        {
          mediaType: 'photo',
          quality: 0.9,
          maxWidth: 1920,
          maxHeight: 1920,
          includeBase64: false,
          saveToPhotos: false,
        },
        (response: ImagePickerResponse) => {
          if (response.didCancel || response.errorCode || !response.assets?.length) {
            resolve(null);
          } else {
            resolve(response.assets[0]);
          }
        }
      );
    });
  }

  // ── Encryption ────────────────────────────────────────────────────────────

  /**
   * Encrypts raw bytes using AES-256-GCM with a fresh random key.
   * @returns { cipherBase64, keyBase64, ivBase64 }
   */
  private encryptBytes(
    dataBase64: string
  ): { cipherBase64: string; keyBase64: string; ivBase64: string } {
    const raw = forge.util.decode64(dataBase64);
    const keyBytes = forge.random.getBytesSync(32); // 256-bit key
    const iv = forge.random.getBytesSync(12);        // 96-bit IV for GCM

    const cipher = forge.cipher.createCipher('AES-GCM', keyBytes);
    cipher.start({ iv, tagLength: 128 });
    cipher.update(forge.util.createBuffer(raw));
    cipher.finish();

    const cipherText = cipher.output.getBytes();
    const tag = (cipher.mode as any).tag.getBytes();
    const combined = cipherText + tag; // tag appended for single-blob storage

    return {
      cipherBase64: forge.util.encode64(combined),
      keyBase64: forge.util.encode64(keyBytes),
      ivBase64: forge.util.encode64(iv),
    };
  }

  /**
   * Wraps (encrypts) a raw AES key bytes using the E2EE Curve25519 shared secret.
   * The shared secret is already derived elsewhere — we just AES-GCM encrypt the key with it.
   */
  /** Convert Uint8Array to forge binary string (no Buffer needed) */
  private uint8ToForgeBytes(arr: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < arr.length; i++) {
      binary += String.fromCharCode(arr[i]);
    }
    return binary;
  }

  private wrapKey(
    rawKeyBase64: string,
    sharedSecret: Uint8Array
  ): { wrappedKey: string; wrapIv: string } {
    const keyBytes = forge.util.decode64(rawKeyBase64);
    const forgeKey = forge.util.createBuffer(this.uint8ToForgeBytes(sharedSecret));

    const iv = forge.random.getBytesSync(12);
    const cipher = forge.cipher.createCipher('AES-GCM', forgeKey);
    cipher.start({ iv, tagLength: 128 });
    cipher.update(forge.util.createBuffer(keyBytes));
    cipher.finish();

    const wrapped = cipher.output.getBytes() + (cipher.mode as any).tag.getBytes();
    return {
      wrappedKey: forge.util.encode64(wrapped),
      wrapIv: forge.util.encode64(iv),
    };
  }

  /**
   * Unwraps (decrypts) a wrapped AES key using the E2EE shared secret.
   */
  private unwrapKey(
    wrappedKeyBase64: string,
    wrapIvBase64: string,
    sharedSecret: Uint8Array
  ): string | null {
    try {
      const combined = forge.util.decode64(wrappedKeyBase64);
      const iv = forge.util.decode64(wrapIvBase64);
      const cipherText = combined.slice(0, -16);
      const tag = combined.slice(-16);

      const forgeKey = forge.util.createBuffer(this.uint8ToForgeBytes(sharedSecret));

      const decipher = forge.cipher.createDecipher('AES-GCM', forgeKey);
      decipher.start({
        iv: forge.util.createBuffer(iv),
        tag: forge.util.createBuffer(tag),
        tagLength: 128,
      });
      decipher.update(forge.util.createBuffer(cipherText));
      if (!decipher.finish()) return null;

      return forge.util.encode64(decipher.output.getBytes());
    } catch {
      return null;
    }
  }

  /**
   * Decrypts an AES-256-GCM encrypted blob.
   */
  private decryptBytes(
    cipherBase64: string,
    keyBase64: string,
    ivBase64: string
  ): string | null {
    try {
      const combined = forge.util.decode64(cipherBase64);
      const cipherText = combined.slice(0, -16);
      const tag = combined.slice(-16);
      const key = forge.util.decode64(keyBase64);
      const iv = forge.util.decode64(ivBase64);

      const decipher = forge.cipher.createDecipher('AES-GCM', forge.util.createBuffer(key));
      decipher.start({
        iv: forge.util.createBuffer(iv),
        tag: forge.util.createBuffer(tag),
        tagLength: 128,
      });
      decipher.update(forge.util.createBuffer(cipherText));
      if (!decipher.finish()) return null;

      return forge.util.encode64(decipher.output.getBytes());
    } catch {
      return null;
    }
  }

  // ── Compress + Encrypt ────────────────────────────────────────────────────

  /**
   * Reads the image at uri, encrypts it, and uploads the encrypted blob to Cloudinary.
   * Returns the Cloudinary URL + wrapped key info needed for RTDB.
   */
  public async encryptAndUploadImage(
    uri: string,
    msgId: string,
    sharedSecret: Uint8Array
  ): Promise<{
    fullUrl: string;
    encImgKey: string;
    encImgKeyIv: string;
  } | null> {
    try {
      // Read the image file as base64
      const base64 = await RNFS.readFile(uri, 'base64');

      // Encrypt the image bytes
      const { cipherBase64, keyBase64, ivBase64 } = this.encryptBytes(base64);

      // Upload the encrypted blob to Cloudinary (RAW resource)
      const fullUrl = await uploadEncryptedBlob(
        cipherBase64,
        CLOUDINARY_CONFIG.IMAGES_FOLDER,
        `${msgId}_full`
      );
      if (!fullUrl) throw new Error('Full image upload failed');

      // Wrap the AES key with the E2EE shared secret so it can be stored in RTDB
      // NOTE: ivBase64 (image encryption IV) is stored directly — only the key needs wrapping
      const { wrappedKey, wrapIv } = this.wrapKey(keyBase64, sharedSecret);

      // We store [wrappedKey | ivBase64 of the cipher] — receiver needs both
      // Pack them: wrappedKey=wrap of aes key, encImgKeyIv=wrap IV, raw IV stored in RTDB under encImgIv
      return {
        fullUrl,
        // Store as "wrappedAesKey||cipherIv" — receiver unwraps key, then decrypts with cipher IV
        encImgKey: `${wrappedKey}::${ivBase64}`,
        encImgKeyIv: wrapIv,
      };
    } catch (err) {
      console.error('[ImageEncryptionService] encryptAndUploadImage error:', err);
      return null;
    }
  }

  /**
   * Generates a small blurry thumbnail, encrypts it, and uploads to Cloudinary.
   */
  public async encryptAndUploadThumbnail(
    uri: string,
    msgId: string,
    sharedSecret: Uint8Array
  ): Promise<{
    thumbUrl: string;
    encThumbKey: string;
    encThumbKeyIv: string;
  } | null> {
    try {
      // For thumbnail: We use react-native-image-picker with small maxWidth to compress
      // Since we already have the URI, re-read it as base64 (thumbnail compression
      // would require a native compressor — here we read the original and rely on
      // Cloudinary's size for differentiation; a proper implementation would use
      // react-native-image-crop-picker's `compressImageMaxWidth: 120` before this call)
      const base64 = await RNFS.readFile(uri, 'base64');

      const { cipherBase64, keyBase64, ivBase64 } = this.encryptBytes(base64);

      const thumbUrl = await uploadEncryptedBlob(
        cipherBase64,
        CLOUDINARY_CONFIG.THUMBS_FOLDER,
        `${msgId}_thumb`
      );
      if (!thumbUrl) throw new Error('Thumbnail upload failed');

      const { wrappedKey, wrapIv } = this.wrapKey(keyBase64, sharedSecret);

      return {
        thumbUrl,
        encThumbKey: `${wrappedKey}::${ivBase64}`,
        encThumbKeyIv: wrapIv,
      };
    } catch (err) {
      console.error('[ImageEncryptionService] encryptAndUploadThumbnail error:', err);
      return null;
    }
  }

  // ── Decrypt + Cache ───────────────────────────────────────────────────────

  /**
   * Downloads an encrypted blob from Cloudinary, decrypts it, and caches it locally.
   *
   * @param url        Cloudinary secure_url for the encrypted blob
   * @param encKeyPacked  The packed "wrappedAesKey::cipherIv" string from RTDB
   * @param wrapIv     The wrap IV used to encrypt the AES key
   * @param sharedSecret  Curve25519 shared secret
   * @param cacheFilePath  Where to write the decrypted JPEG on-device
   * @returns  base64 JPEG string, or null on failure
   */
  public async downloadAndDecrypt(
    url: string,
    encKeyPacked: string,
    wrapIv: string,
    sharedSecret: Uint8Array,
    cacheFilePath: string
  ): Promise<string | null> {
    try {
      // 1. Check cache first
      const exists = await RNFS.exists(cacheFilePath);
      if (exists) {
        const cached = await RNFS.readFile(cacheFilePath, 'base64');
        console.log('[ImageEncryptionService] Cache hit:', cacheFilePath);
        return cached;
      }

      // 2. Download encrypted blob from Cloudinary
      const cipherBase64 = await downloadBlobAsBase64(url);
      if (!cipherBase64) return null;

      // 3. Unpack: wrappedAesKey::cipherIv
      const sepIdx = encKeyPacked.lastIndexOf('::');
      if (sepIdx === -1) { console.error('Invalid encKey format'); return null; }
      const wrappedAesKey = encKeyPacked.substring(0, sepIdx);
      const cipherIv = encKeyPacked.substring(sepIdx + 2);

      // 4. Unwrap the AES key using E2EE shared secret
      const rawAesKeyBase64 = this.unwrapKey(wrappedAesKey, wrapIv, sharedSecret);
      if (!rawAesKeyBase64) { console.error('[ImageEncryptionService] Key unwrap failed'); return null; }

      // 5. Decrypt the image bytes
      const decryptedBase64 = this.decryptBytes(cipherBase64, rawAesKeyBase64, cipherIv);
      if (!decryptedBase64) { console.error('[ImageEncryptionService] Image decryption failed'); return null; }

      // 6. Write to cache directory
      await this.ensureDir(CACHE_DIR);
      await RNFS.writeFile(cacheFilePath, decryptedBase64, 'base64');
      console.log('[ImageEncryptionService] Decrypted & cached:', cacheFilePath);

      return decryptedBase64;
    } catch (err) {
      console.error('[ImageEncryptionService] downloadAndDecrypt error:', err);
      return null;
    }
  }

  // ── Gallery Save ──────────────────────────────────────────────────────────

  /**
   * Saves a decrypted image (base64 JPEG) to the device's ChitChat gallery folder.
   * On Android: /sdcard/Pictures/ChitChat/
   * On iOS:     ~/Documents/ChitChat/
   *
   * @returns The saved file path, or null on failure.
   */
  public async saveToGallery(base64Jpeg: string, filename: string): Promise<string | null> {
    try {
      await this.ensureDir(CHITCHAT_DIR);
      const filePath = `${CHITCHAT_DIR}/${filename}.jpg`;
      await RNFS.writeFile(filePath, base64Jpeg, 'base64');

      // On Android, trigger media scanner so the file shows in Gallery apps
      if (Platform.OS === 'android') {
        await RNFS.scanFile(filePath);
      }

      console.log('[ImageEncryptionService] Saved to gallery:', filePath);
      return filePath;
    } catch (err) {
      console.error('[ImageEncryptionService] saveToGallery error:', err);
      return null;
    }
  }

  // ── Cache Helpers ─────────────────────────────────────────────────────────

  /** Returns the local cache path for a message's thumbnail. */
  public getThumbCachePath(msgId: string): string {
    return `${CACHE_DIR}/${msgId}_thumb.jpg`;
  }

  /** Returns the local cache path for a message's full image. */
  public getFullCachePath(msgId: string): string {
    return `${CACHE_DIR}/${msgId}_full.jpg`;
  }

  private async ensureDir(dir: string): Promise<void> {
    const exists = await RNFS.exists(dir);
    if (!exists) {
      await RNFS.mkdir(dir);
    }
  }
}

export default new ImageEncryptionService();

/**
 * StatusService.ts
 *
 * Core service for WhatsApp-style Status/Stories in ChitChat.
 *
 * Architecture:
 *  - Firestore `/statuses/{statusId}` for metadata + encrypted keys
 *  - Cloudinary for encrypted image blobs (same pipeline as chat images)
 *  - Subcollections `/statuses/{id}/viewers/` and `/statuses/{id}/likes/`
 *  - 24-hour TTL (client-side filter; Firestore TTL policies handle cleanup)
 */

import firestore from '@react-native-firebase/firestore';
import forge from 'node-forge';
import RNFS from 'react-native-fs';
import { uploadEncryptedBlob, downloadBlobAsBase64 } from '../media/CloudinaryService';
import { CLOUDINARY_CONFIG } from '../media/CloudinaryConfig';
import EncryptionService from '../chat/EncryptionService';
import LocalDBService from '../../localDB/LocalDBService';
import { SaavnSong } from './JioSaavnService';

// ─── Types ────────────────────────────────────────────────────────────────────
const NOTIFICATION_SERVER_URL = 'http://10.71.90.27:5221'; // Change to your local IP if on physical device

export interface StatusData {
  id: string;
  ownerUid: string;
  ownerName: string;
  ownerPhoto: string;
  type: 'image' | 'text' | 'music';
  // Encrypted image
  encImageUrl?: string;
  encKey?: string;        // AES-256-GCM key (base64)
  encKeyIv?: string;      // AES IV (base64)
  // Text status
  text?: string;
  bgGradient?: string[];
  // Song
  songId?: string;
  songName?: string;
  songArtist?: string;
  songImageUrl?: string;
  songStreamUrl?: string;
  songDuration?: number;
  songStartTime?: number; // Starting offset in seconds
  // Metadata
  caption?: string;
  createdAt: number;
  expiresAt: number;
  viewCount: number;
  likeCount: number;
}

export interface StatusViewer {
  uid: string;
  name: string;
  photo?: string;
  viewedAt: number;
}

export interface StatusLike {
  uid: string;
  name: string;
  photo?: string;
  likedAt: number;
}

export interface GroupedStatus {
  ownerUid: string;
  ownerName: string;
  ownerPhoto: string;
  statuses: StatusData[];
  hasUnseen: boolean;
  latestTimestamp: number;
}

// ─── Gradient Presets (WhatsApp-style) ────────────────────────────────────────

export const STATUS_GRADIENTS = [
  ['#667eea', '#764ba2'],  // Purple
  ['#f093fb', '#f5576c'],  // Pink
  ['#4facfe', '#00f2fe'],  // Blue
  ['#43e97b', '#38f9d7'],  // Green
  ['#fa709a', '#fee140'],  // Sunset
  ['#a18cd1', '#fbc2eb'],  // Lavender
  ['#fccb90', '#d57eeb'],  // Peach
  ['#e0c3fc', '#8ec5fc'],  // Sky
  ['#f5576c', '#ff6f61'],  // Red
  ['#30cfd0', '#330867'],  // Deep Teal
];

const STATUSES_COLLECTION = 'statuses';
const STATUS_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert Uint8Array to forge binary string */
function uint8ToForgeBytes(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return binary;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class StatusService {

  // ── Encrypt Image ─────────────────────────────────────────────────────────

  /**
   * Encrypts image bytes with a random AES-256-GCM key.
   * Returns ciphertext + key + IV (all base64).
   */
  private encryptImageBytes(
    dataBase64: string
  ): { cipherBase64: string; keyBase64: string; ivBase64: string } {
    const raw = forge.util.decode64(dataBase64);
    const keyBytes = forge.random.getBytesSync(32);
    const iv = forge.random.getBytesSync(12);

    const cipher = forge.cipher.createCipher('AES-GCM', keyBytes);
    cipher.start({ iv, tagLength: 128 });
    cipher.update(forge.util.createBuffer(raw));
    cipher.finish();

    const cipherText = cipher.output.getBytes();
    const tag = (cipher.mode as any).tag.getBytes();

    return {
      cipherBase64: forge.util.encode64(cipherText + tag),
      keyBase64: forge.util.encode64(keyBytes),
      ivBase64: forge.util.encode64(iv),
    };
  }

  /**
   * Decrypts an AES-256-GCM encrypted blob.
   */
  public decryptImageBytes(
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

  // ── Post Status ───────────────────────────────────────────────────────────

  /**
   * Posts an image status with optional song clip.
   */
  public async postImageStatus(
    myUid: string,
    myName: string,
    myPhoto: string,
    imageUri: string,
    caption?: string,
    song?: SaavnSong | null,
    songStartTime?: number
  ): Promise<string | null> {
    try {
      // 1. Read + encrypt image
      const cleanUri = imageUri.replace('file://', '');
      const base64 = await RNFS.readFile(cleanUri, 'base64');
      const { cipherBase64, keyBase64, ivBase64 } = this.encryptImageBytes(base64);

      // 2. Upload encrypted blob to Cloudinary
      const statusId = `status_${myUid}_${Date.now()}`;
      const encImageUrl = await uploadEncryptedBlob(
        cipherBase64,
        CLOUDINARY_CONFIG.IMAGES_FOLDER,
        statusId
      );
      if (!encImageUrl) throw new Error('Cloudinary upload failed');

      const now = Date.now();

      // 3. Write to Firestore
      const statusDoc: any = {
        ownerUid: myUid,
        ownerName: myName,
        ownerPhoto: myPhoto || '',
        type: song ? 'music' : 'image',
        encImageUrl,
        encKey: keyBase64,
        encKeyIv: ivBase64,
        caption: caption || '',
        createdAt: now,
        expiresAt: now + STATUS_EXPIRY_MS,
        viewCount: 0,
        likeCount: 0,
      };

      if (song) {
        statusDoc.songId = song.id;
        statusDoc.songName = song.name;
        statusDoc.songArtist = song.artist;
        statusDoc.songImageUrl = song.albumArt;
        statusDoc.songStreamUrl = song.streamUrl;
        statusDoc.songDuration = Math.min(song.duration, 30); // Cap at 30s
        statusDoc.songStartTime = songStartTime || 0;
      }

      await firestore().collection(STATUSES_COLLECTION).doc(statusId).set(statusDoc);
      console.log('[StatusService] Image status posted:', statusId);
      return statusId;
    } catch (err) {
      console.error('[StatusService] postImageStatus error:', err);
      return null;
    }
  }

  /**
   * Posts a text-only status with gradient background.
   */
  public async postTextStatus(
    myUid: string,
    myName: string,
    myPhoto: string,
    text: string,
    bgGradient: string[],
    song?: SaavnSong | null,
    songStartTime?: number
  ): Promise<string | null> {
    try {
      const now = Date.now();
      const statusId = `status_${myUid}_${Date.now()}`;

      const statusDoc: any = {
        ownerUid: myUid,
        ownerName: myName,
        ownerPhoto: myPhoto || '',
        type: song ? 'music' : 'text',
        text,
        bgGradient,
        createdAt: now,
        expiresAt: now + STATUS_EXPIRY_MS,
        viewCount: 0,
        likeCount: 0,
      };

      if (song) {
        statusDoc.songId = song.id;
        statusDoc.songName = song.name;
        statusDoc.songArtist = song.artist;
        statusDoc.songImageUrl = song.albumArt;
        statusDoc.songStreamUrl = song.streamUrl;
        statusDoc.songDuration = Math.min(song.duration, 30);
        statusDoc.songStartTime = songStartTime || 0;
      }

      await firestore().collection(STATUSES_COLLECTION).doc(statusId).set(statusDoc);
      console.log('[StatusService] Text status posted:', statusId);
      return statusId;
    } catch (err) {
      console.error('[StatusService] postTextStatus error:', err);
      return null;
    }
  }

  // ── Fetch Statuses ────────────────────────────────────────────────────────

  /**
   * Fetches all active (non-expired) statuses from contacts.
   * Groups them by owner for the StatusScreen list.
   */
  public async getContactStatuses(
    myUid: string,
    viewedStatusIds: Set<string> = new Set()
  ): Promise<GroupedStatus[]> {
    try {
      const now = Date.now();

      // Simple single-field query — no composite index needed
      const snapshot = await firestore()
        .collection(STATUSES_COLLECTION)
        .where('expiresAt', '>', now)
        .get();

      const statusMap = new Map<string, GroupedStatus>();

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Client-side filter: exclude my own statuses
        if (data.ownerUid === myUid) return;

        const status: StatusData = {
          id: doc.id,
          ownerUid: data.ownerUid,
          ownerName: data.ownerName, // Fallback
          ownerPhoto: data.ownerPhoto || '',
          type: data.type,
          encImageUrl: data.encImageUrl,
          encKey: data.encKey,
          encKeyIv: data.encKeyIv,
          text: data.text,
          bgGradient: data.bgGradient,
          songId: data.songId,
          songName: data.songName,
          songArtist: data.songArtist,
          songImageUrl: data.songImageUrl,
          songStreamUrl: data.songStreamUrl,
          songDuration: data.songDuration,
          songStartTime: data.songStartTime || 0,
          caption: data.caption,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          viewCount: data.viewCount || 0,
          likeCount: data.likeCount || 0,
        };

        // Resolve local name from SQLite
        const localContact = LocalDBService.getContactByUid(data.ownerUid);
        const resolvedName = localContact?.name || data.ownerName;

        const existing = statusMap.get(data.ownerUid);
        if (existing) {
          existing.statuses.push(status);
          if (!viewedStatusIds.has(doc.id)) existing.hasUnseen = true;
          existing.latestTimestamp = Math.max(existing.latestTimestamp, data.createdAt);
        } else {
          statusMap.set(data.ownerUid, {
            ownerUid: data.ownerUid,
            ownerName: resolvedName,
            ownerPhoto: localContact?.photo || data.ownerPhoto || '',
            statuses: [status],
            hasUnseen: !viewedStatusIds.has(doc.id),
            latestTimestamp: data.createdAt,
          });
        }
      });

      // Client-side sort: unseen first, then by latest timestamp
      const groups = Array.from(statusMap.values());
      groups.forEach(g => g.statuses.sort((a, b) => b.createdAt - a.createdAt));
      return groups.sort((a, b) => {
        if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
        return b.latestTimestamp - a.latestTimestamp;
      });
    } catch (err) {
      console.error('[StatusService] getContactStatuses error:', err);
      return [];
    }
  }

  /**
   * Fetches my own active statuses.
   */
  public async getMyStatuses(myUid: string): Promise<StatusData[]> {
    try {
      const now = Date.now();

      // Simple single-field query — no composite index needed
      const snapshot = await firestore()
        .collection(STATUSES_COLLECTION)
        .where('ownerUid', '==', myUid)
        .get();

      return snapshot.docs
        .map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            ownerUid: d.ownerUid,
            ownerName: d.ownerName,
            ownerPhoto: d.ownerPhoto || '',
            type: d.type,
            encImageUrl: d.encImageUrl,
            encKey: d.encKey,
            encKeyIv: d.encKeyIv,
            text: d.text,
            bgGradient: d.bgGradient,
            songId: d.songId,
            songName: d.songName,
            songArtist: d.songArtist,
            songImageUrl: d.songImageUrl,
            songStreamUrl: d.songStreamUrl,
            songDuration: d.songDuration,
            songStartTime: d.songStartTime || 0,
            caption: d.caption,
            createdAt: d.createdAt,
            expiresAt: d.expiresAt,
            viewCount: d.viewCount || 0,
            likeCount: d.likeCount || 0,
          } as StatusData;
        })
        // Client-side filter: only non-expired, sorted newest first
        .filter(s => s.expiresAt > now)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      console.error('[StatusService] getMyStatuses error:', err);
      return [];
    }
  }

  // ── Views & Likes ─────────────────────────────────────────────────────────

  /**
   * Records a view on a status.
   */
  public async recordView(
    statusId: string,
    viewerUid: string,
    viewerName: string,
    viewerPhoto?: string
  ): Promise<void> {
    try {
      const viewerRef = firestore()
        .collection(STATUSES_COLLECTION)
        .doc(statusId)
        .collection('viewers')
        .doc(viewerUid);

      const existsResult = (await viewerRef.get()).exists();
      if (existsResult) return; // Already viewed

      const batch = firestore().batch();
      batch.set(viewerRef, {
        name: viewerName,
        photo: viewerPhoto || '',
        viewedAt: Date.now(),
      });
      batch.update(
        firestore().collection(STATUSES_COLLECTION).doc(statusId),
        { viewCount: firestore.FieldValue.increment(1) }
      );
      await batch.commit();
    } catch (err) {
      console.error('[StatusService] recordView error:', err);
    }
  }

  /**
   * Toggles a like on a status. Returns true if liked, false if unliked.
   */
  public async toggleLike(
    statusId: string,
    likerUid: string,
    likerName: string,
    likerPhoto?: string
  ): Promise<boolean> {
    try {
      const likeRef = firestore()
        .collection(STATUSES_COLLECTION)
        .doc(statusId)
        .collection('likes')
        .doc(likerUid);

      const likeDoc = await likeRef.get();
      const batch = firestore().batch();

      if (likeDoc.exists()) {
        // Unlike
        batch.delete(likeRef);
        batch.update(
          firestore().collection(STATUSES_COLLECTION).doc(statusId),
          { likeCount: firestore.FieldValue.increment(-1) }
        );
        await batch.commit();
        return false;
      } else {
        // Like
        batch.set(likeRef, {
          name: likerName,
          photo: likerPhoto || '',
          likedAt: Date.now(),
        });
        batch.update(
          firestore().collection(STATUSES_COLLECTION).doc(statusId),
          { likeCount: firestore.FieldValue.increment(1) }
        );
        await batch.commit();
        return true;
      }
    } catch (err) {
      console.error('[StatusService] toggleLike error:', err);
      return false;
    }
  }

  /**
   * Check if current user has liked a status.
   */
  public async hasLiked(statusId: string, myUid: string): Promise<boolean> {
    try {
      const doc = await firestore()
        .collection(STATUSES_COLLECTION)
        .doc(statusId)
        .collection('likes')
        .doc(myUid)
        .get();
      return doc.exists();
    } catch {
      return false;
    }
  }

  /**
   * Fetches viewer list for a status.
   */
  public async getViewers(statusId: string): Promise<StatusViewer[]> {
    try {
      const snapshot = await firestore()
        .collection(STATUSES_COLLECTION)
        .doc(statusId)
        .collection('viewers')
        .orderBy('viewedAt', 'desc')
        .get();

      return snapshot.docs.map(doc => ({
        uid: doc.id,
        name: doc.data().name,
        photo: doc.data().photo,
        viewedAt: doc.data().viewedAt,
      }));
    } catch (err) {
      console.error('[StatusService] getViewers error:', err);
      return [];
    }
  }

  /**
   * Fetches like list for a status.
   */
  public async getLikes(statusId: string): Promise<StatusLike[]> {
    try {
      const snapshot = await firestore()
        .collection(STATUSES_COLLECTION)
        .doc(statusId)
        .collection('likes')
        .orderBy('likedAt', 'desc')
        .get();

      return snapshot.docs.map(doc => ({
        uid: doc.id,
        name: doc.data().name,
        photo: doc.data().photo,
        likedAt: doc.data().likedAt,
      }));
    } catch (err) {
      console.error('[StatusService] getLikes error:', err);
      return [];
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  /**
   * Deletes a status (only owner can delete).
   */
  public async deleteStatus(statusId: string, ownerUid: string): Promise<boolean> {
    try {
      const doc = await firestore().collection(STATUSES_COLLECTION).doc(statusId).get();
      if (!doc.exists || doc.data()?.ownerUid !== ownerUid) return false;

      // Delete subcollections first
      const viewerSnap = await doc.ref.collection('viewers').get();
      const likeSnap = await doc.ref.collection('likes').get();
      const batch = firestore().batch();
      viewerSnap.docs.forEach(d => batch.delete(d.ref));
      likeSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc.ref);
      await batch.commit();

      console.log('[StatusService] Status deleted:', statusId);
      return true;
    } catch (err) {
      console.error('[StatusService] deleteStatus error:', err);
      return false;
    }
  }

  // ── Push Notification ─────────────────────────────────────────────────────

  /**
   * Triggers a push notification when someone likes a status.
   */
  public async sendLikeNotification(
    statusOwnerUid: string,
    likerUid: string,
    likerName: string,
    statusId: string
  ): Promise<void> {
    try {
      const res = await fetch(`${NOTIFICATION_SERVER_URL}/send-status-like-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: statusOwnerUid,
          senderId: likerUid,
          senderName: likerName,
          statusId,
          type: 'status_like',
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Server returned ${res.status}: ${errorText}`);
      }
      console.log('[StatusService] Like notification sent successfully');
    } catch (err) {
      console.error('[StatusService] Like notification error:', err);
    }
  }

  // ── Media Caching (24h Optimization) ───────────────────────────────────────

  /**
   * Generates a local path for a status media file.
   */
  private getMediaCachePath(statusId: string): string {
    return `${RNFS.CachesDirectoryPath}/status_${statusId}.jpg`;
  }

  /**
   * Saves a decrypted image to the local cache.
   */
  public async saveToMediaCache(statusId: string, base64: string): Promise<string> {
    const path = this.getMediaCachePath(statusId);
    try {
      await RNFS.writeFile(path, base64, 'base64');
      return path;
    } catch (err) {
      console.error('[StatusService] saveToMediaCache error:', err);
      return '';
    }
  }

  /**
   * Checks if a status media is already cached and returns its path.
   */
  public async getFromMediaCache(statusId: string): Promise<string | null> {
    const path = this.getMediaCachePath(statusId);
    try {
      const exists = await RNFS.exists(path);
      if (exists) return path;
    } catch {}
    return null;
  }

  /**
   * Cleanup task: Delete media older than 24 hours.
   */
  public async cleanOldCache(): Promise<void> {
    try {
      const files = await RNFS.readDir(RNFS.CachesDirectoryPath);
      const now = Date.now();
      const statusFiles = files.filter(f => f.name.startsWith('status_'));
      
      for (const file of statusFiles) {
        const stats = await RNFS.stat(file.path);
        const mtime = typeof stats.mtime === 'number' ? stats.mtime : (stats.mtime as any).getTime();
        // If file is older than 24h
        if (now - mtime > 86400000) {
          await RNFS.unlink(file.path).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[StatusService] cleanOldCache error:', err);
    }
  }
}

export default new StatusService();

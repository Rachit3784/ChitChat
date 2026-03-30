import database from '@react-native-firebase/database';
import firestore from '@react-native-firebase/firestore';
import NetInfo from '@react-native-community/netinfo';
import EncryptionService from './EncryptionService';
import LocalDBService, { CachedMessage } from '../../localDB/LocalDBService';
import ImageEncryptionService from '../media/ImageEncryptionService';
import { Asset } from 'react-native-image-picker';
import userStore from '../../store/MyStore';

class MessageSyncService {
  public activeChatId: string | null = null;
  private activeMyUid: string | null = null;
  private messageListeners: Map<string, boolean> = new Map();
  private onMessageCallback: ((chatId: string) => void) | null = null;
  private connectivityListener: any = null;
  public onInboxUpdatedCallback: (() => void) | null = null;
  
  // Cache derived shared secrets to avoid repeated ECDH/Firestore lookups on every message
  private sharedSecretCache = new Map<string, Uint8Array>();

  private sessionStartTime: number = 0;
  private globalDeletedAt: number = 0;

  // ── Helpers ────────────────────────────────────────────────────────────────

  public getChatId(uid1: string, uid2: string): string {
    return [uid1, uid2].sort().join('_');
  }

  public setOnMessageCallback(cb: ((chatId: string) => void) | null) {
    this.onMessageCallback = cb;
  }

  public setOnInboxUpdatedCallback(cb: (() => void) | null) {
    this.onInboxUpdatedCallback = cb;
  }

  public setActiveMyUid(uid: string) {
    this.activeMyUid = uid;
  }

  // ── Inbox Listener (HomeScreen) ────────────────────────────────────────────

  /**
   * Listen to the user's RTDB inbox.
   * - Resolves unknown senders from Firestore and upserts them with chatInit=1.
   * - Updates lastMessage + unreadCount in SQLite.
   * - Notifies HomeScreen to refresh via callback.
   */
  public listenToInbox(myUid: string) {
    this.sessionStartTime = Date.now();
    this.activeMyUid = myUid;
    this.globalDeletedAt = LocalDBService.getGlobalDeletedAt();
    
    const ref = database().ref(`inbox/${myUid}`);
    ref.off();

    const handleInboxEntry = async (snapshot: any) => {
      const contactUid = snapshot.key;
      const data = snapshot.val();
      const keyUpdatedAt = userStore.getState().keyUpdatedAt || 0;

      if (!data || !contactUid) return;
      if (data.timestamp && data.timestamp < keyUpdatedAt) {
        console.log(`[MSS] Skipping legacy inbox entry for ${contactUid} (Epoch: ${keyUpdatedAt}, Msg: ${data.timestamp})`);
        return;
      }

      // ── Global & Contact Stamp Check ────────────────────
      if (data.timestamp && data.timestamp < this.globalDeletedAt) {
        console.log(`[MSS] Skipping globally wiped inbox entry for ${contactUid}`);
        return;
      }

      const deletedAt = LocalDBService.getChatDeletedAt(contactUid);
      if (data.timestamp && data.timestamp < deletedAt) {
        console.log(`[MSS] Skipping wiped inbox entry for ${contactUid} (Stamp: ${deletedAt}, Msg: ${data.timestamp})`);
        return;
      }

      const chatId = this.getChatId(myUid, contactUid);
      const isCurrentlyInChat = this.activeChatId === chatId;

      // ── Enforce Active Chat Rule ─────────────────────────────────────────
      // If we received an unread increment but we are actively looking at this chat,
      // instantly zero it out in RTDB and locally.
      let unread = data.unreadCount || 0;
      if (isCurrentlyInChat) {
        unread = 0;
        // Instantly write back 0 to RTDB (Atomic overwrite) if it's currently > 0
        if (data.unreadCount > 0) {
          database().ref(`inbox/${myUid}/${contactUid}`).update({ unreadCount: 0 });
        }
      }

      // ── Decrypt the last message preview ─────────────────────────────────
      let decryptedPreview = data.lastMessagePreview || '';
      const hasCipher = data.lastMessageCipherText && data.lastMessageIv;

      if (hasCipher) {
        try {
          let sharedSecret = this.sharedSecretCache.get(chatId);
          if (!sharedSecret) {
            const contactPubKey = await EncryptionService.getContactPublicKey(contactUid);
            if (contactPubKey) {
              const secret = await EncryptionService.getSharedSecret(myUid, contactPubKey);
              if (secret) {
                sharedSecret = secret;
                this.sharedSecretCache.set(chatId, sharedSecret);
              }
            }
          }

          if (sharedSecret) {
            const result = EncryptionService.decrypt(
              { cipherText: data.lastMessageCipherText, iv: data.lastMessageIv },
              sharedSecret
            );
            if (result) {
              decryptedPreview = result;
            }
          }
        } catch (decErr) {
          decryptedPreview = '(encrypted message)';
        }
      }

      // ── Upsert contact in SQLite (Local-First binding) ─────────────────
      let contact = LocalDBService.getContactByUid(contactUid);
      const msgTimestamp = data.timestamp || Date.now();

      if (!contact) {
        // Unknown sender — resolve profile from Firestore
        try {
          const userDoc = await firestore().collection('users').doc(contactUid).get();
          const ud = userDoc.data();
          if (ud) {
            LocalDBService.upsertContacts([{
              phoneNumber: ud.mobileNumber || `unknown_${contactUid}`,
              firebase_uid: contactUid,
              name: ud.name || ud.username || 'Unknown',
              photo: ud.photo || null,
              isRegistered: 1,
              chatInit: 1,
              lastSync: Date.now(),
              lastMessage: decryptedPreview,
              unreadCount: unread,
              chatTimestamp: msgTimestamp,
            }]);
          }
        } catch (err) {
          console.error('[MSS] Failed to resolve unknown sender:', err);
        }
      } else {
        // Known contact — update metadata + ensure chatInit=1
        LocalDBService.updateContactMetadata(contactUid, decryptedPreview, unread, msgTimestamp);

        if (!contact.chatInit) {
          LocalDBService.upsertContacts([{
            ...contact,
            chatInit: 1,
            lastSync: Date.now(),
            chatTimestamp: msgTimestamp,
          }]);
        }
      }

      // Notify HomeScreen UI to re-render from SQLite
      if (this.onInboxUpdatedCallback) this.onInboxUpdatedCallback();

      // Ensure message listener is running to trigger 'Seen' status back
      this.startChatListener(myUid, contactUid);
    };

    ref.on('child_added', handleInboxEntry);
    ref.on('child_changed', handleInboxEntry);
  }

  /**
   * Scans the RTDB inbox once on login/init.
   * Resets unreadCount to 0 for any entries older than the new encryption epoch (keyUpdatedAt).
   * This fixes the "count of 6, but 1 message" UI inconsistency.
   */
  public async cleanseInboxEpoch(myUid: string, epoch: number) {
    if (!epoch) return;
    console.log(`[MSS] Cleansing RTDB inbox for epoch: ${epoch}`);
    try {
      const snap = await database().ref(`inbox/${myUid}`).once('value');
      const data = snap.val();
      if (!data) return;

      const updates: any = {};
      Object.entries(data).forEach(([contactUid, entry]: [string, any]) => {
        if (entry.timestamp && entry.timestamp < epoch && entry.unreadCount > 0) {
          updates[`/inbox/${myUid}/${contactUid}/unreadCount`] = 0;
          console.log(`[MSS] Epoch cleanse: Zeroed unread for ${contactUid}`);
        }
      });

      if (Object.keys(updates).length > 0) {
        await database().ref().update(updates);
      }
    } catch (err) {
      console.error('[MSS] cleanseInboxEpoch error:', err);
    }
  }

  // ── Chat Message Listener ──────────────────────────────────────────────────

  /**
   * Starts a real-time listener on a specific chat's messages.
   * Called from ChatScreen directly AND from inbox handler.
   */
  public async startChatListener(myUid: string, contactUid: string) {
    const chatId = this.getChatId(myUid, contactUid);
    if (this.messageListeners.has(chatId)) return;

    let sharedSecret = this.sharedSecretCache.get(chatId);
    if (!sharedSecret) {
      const contactPubKey = await EncryptionService.getContactPublicKey(contactUid);
      if (!contactPubKey) {
        console.warn(`[MSS] No public key for ${contactUid}, skipping listener.`);
        return;
      }

      const secret = await EncryptionService.getSharedSecret(myUid, contactPubKey);
      if (!secret) {
        console.warn(`[MSS] No shared secret for ${contactUid}.`);
        return;
      }
      sharedSecret = secret;
      this.sharedSecretCache.set(chatId, sharedSecret);
    }

    const keyUpdatedAt = userStore.getState().keyUpdatedAt || 0;
    console.log(`[MSS] Starting listener for chat: ${chatId} (Filtering from: ${keyUpdatedAt})`);

    const messagesRef = database()
      .ref(`messages/${chatId}`)
      .orderByChild('timestamp')
      .startAt(keyUpdatedAt)
      .limitToLast(50);

    // New message
    messagesRef.on('child_added', (snapshot) => {
      const data = snapshot.val();
      const msgId = snapshot.key;
      if (!data || !msgId) return;

      // Check if user has explicitly deleted this message for themselves (Tombstone)
      if (LocalDBService.isMessageDeleted(msgId)) {
        console.log(`[MSS] Skipping blacklisted msg: ${msgId.slice(0, 8)}`);
        return;
      }

      // ── Global & Contact Stamp Check ──────────────────────────────────────
      if (data.timestamp && data.timestamp < this.globalDeletedAt) {
        console.log(`[MSS] Skipping globally wiped message: ${msgId.slice(0, 8)}`);
        return;
      }

      const deletedAt = LocalDBService.getChatDeletedAt(contactUid);
      if (data.timestamp && data.timestamp < deletedAt) {
        console.log(`[MSS] Skipping wiped message: ${msgId.slice(0, 8)} (Stamp: ${deletedAt}, Msg: ${data.timestamp})`);
        return;
      }

      // Check if already stored
      const existing = LocalDBService.getCachedMessages(chatId, 1000);
      const existingMsg = existing.find(m => m.id === msgId);
      
      if (existingMsg) {
        // If it was stuck in Pending (0) but Firebase has it, it finally reached the server!
        if (existingMsg.status === 0 && data.status >= 1) {
          LocalDBService.updateMessageStatus(msgId, data.status);
          if (this.onMessageCallback) this.onMessageCallback(chatId);
        }
        
        // Sync status from server for incoming/outgoing messages if different
        if (existingMsg.status < data.status) {
           LocalDBService.updateMessageStatus(msgId, data.status);
           if (this.onMessageCallback) this.onMessageCallback(chatId);
        }

        // Mark read for incoming messages if we are actively in this chat
        if (this.activeChatId === chatId && data.senderId !== myUid && data.status < 3) {
          this.markMessageAsRead(chatId, msgId);
        }
        return;
      }


      // ── Image message ────────────────────────────────────────────────────
      if (data.type === 'image') {
        const msg: CachedMessage = {
          id: msgId,
          chatId,
          senderId: data.senderId,
          text: '',
          image: null,
          timestamp: data.timestamp,
          status: data.status,
          type: 'image',
          pendingSeenSync: 0,
          thumbUrl: data.thumbUrl || null,
          fullUrl: data.fullUrl || null,
          encThumbKey: data.encThumbKey || null,
          encThumbKeyIv: data.encThumbKeyIv || null,
          encImgKey: data.encImgKey || null,
          encImgKeyIv: data.encImgKeyIv || null,
          imageWidth: data.width || null,
          imageHeight: data.height || null,
          caption: null,
        };

        // Decrypt optional caption
        if (data.encCaptionCipherText && data.encCaptionIv) {
          try {
            const decCaption = EncryptionService.decrypt(
              { cipherText: data.encCaptionCipherText, iv: data.encCaptionIv },
              sharedSecret
            );
            msg.caption = decCaption || null;
          } catch {}
        }

        LocalDBService.saveMessage(msg);

        const preview = msg.caption ? `📷 ${msg.caption}` : '📷 Photo';
        if (data.senderId !== myUid) {
          LocalDBService.updateContactLastMessage(contactUid, preview);
        }

        // Auto-download thumbnail in the background (non-blocking)
        this.downloadAndCacheThumb(msg, sharedSecret);

        if (this.onMessageCallback) this.onMessageCallback(chatId);

        if (this.activeChatId === chatId && data.senderId !== myUid && data.status < 3) {
          this.markMessageAsRead(chatId, msgId);
        }
        return;
      }

      // ── Text message (existing logic) ────────────────────────────────────
      // Guard: skip messages with no cipherText/iv (corrupted or old failed uploads)
      if (!data.cipherText || !data.iv) {
        console.warn(`[MSS] Skipping msg ${msgId} — no cipherText/iv (possibly a corrupted entry)`);
        return;
      }

      try {
        const decrypted = EncryptionService.decrypt(
          { cipherText: data.cipherText, iv: data.iv },
          sharedSecret
        );

        if (decrypted) {
          const msg: CachedMessage = {
            id: msgId,
            chatId,
            senderId: data.senderId,
            text: decrypted,
            image: null,
            timestamp: data.timestamp,
            status: data.status,
            type: data.type || 'text',
            pendingSeenSync: 0,
          };

          LocalDBService.saveMessage(msg);
          console.log(`[MSS] Decrypted & saved: ${msgId.slice(0, 8)}...`);

          if (data.senderId !== myUid) {
            LocalDBService.updateContactLastMessage(contactUid, decrypted);
          }

          if (this.onMessageCallback) this.onMessageCallback(chatId);

          if (this.activeChatId === chatId && data.senderId !== myUid && data.status < 3) {
            this.markMessageAsRead(chatId, msgId);
          }
        } else {
          // Silently ignore decryption failures
        }
      } catch (err) {
        // Silently ignore decryption errors
      }
    });

    // Status update (sent → delivered → read)
    messagesRef.on('child_changed', (snapshot) => {
      const data = snapshot.val();
      if (snapshot.key && LocalDBService.isMessageDeleted(snapshot.key)) return;
      if (data.timestamp && data.timestamp < keyUpdatedAt) return;

      LocalDBService.saveMessage({
        id: snapshot.key as string,
        status: data.status,
      } as any);

      if (this.onMessageCallback) this.onMessageCallback(chatId);
    });
  }

  // ── Send Message ───────────────────────────────────────────────────────────

  // ── Send Image Message ─────────────────────────────────────────────────────

  /**
   * WhatsApp-style encrypted image send:
   *  1. Compress + encrypt full image & thumbnail
   *  2. Upload encrypted blobs to Cloudinary
   *  3. Save placeholder to SQLite (type: 'image', status: 0)
   *  4. Write RTDB message with URLs + wrapped keys
   *  5. Trigger push notification
   */
  public async sendImageMessage(
    myUid: string,
    contactUid: string,
    asset: Asset,
    caption?: string
  ): Promise<string | null> {
    const chatId = this.getChatId(myUid, contactUid);
    const uri = asset.uri!;
    const width = asset.width || 0;
    const height = asset.height || 0;
    const fileSize = asset.fileSize || 0;

    // 1. Get E2EE shared secret
    let sharedSecret = this.sharedSecretCache.get(chatId);
    if (!sharedSecret) {
      const contactPubKey = await EncryptionService.getContactPublicKey(contactUid);
      if (!contactPubKey) throw new Error('Recipient public key not found');
      const secret = await EncryptionService.getSharedSecret(myUid, contactPubKey);
      if (!secret) throw new Error('Shared secret generation failed');
      sharedSecret = secret;
      this.sharedSecretCache.set(chatId, sharedSecret);
    }

    // 2. Generate a unique message ID
    const msgId = database().ref(`messages/${chatId}`).push().key!;
    const timestamp = Date.now();

    // 3. Optimistic local save — shows immediately in chat UI with uploaded=false
    const localThumbPath = ImageEncryptionService.getThumbCachePath(msgId);
    const localFullPath = ImageEncryptionService.getFullCachePath(msgId);

    LocalDBService.saveMessage({
      id: msgId,
      chatId,
      senderId: myUid,
      text: '',
      image: uri, // Use original URI as preview while uploading
      timestamp,
      status: 0,
      type: 'image',
      imageWidth: width,
      imageHeight: height,
      caption: caption || null,
      pendingSeenSync: 0,
      pendingPush: 0,
    });

    LocalDBService.updateContactLastMessage(contactUid, caption ? `📷 ${caption}` : '📷 Photo');
    const contact = LocalDBService.getContactByUid(contactUid);
    if (contact?.phoneNumber) {
      LocalDBService.updateChatInit(contact.phoneNumber, true);
    }
    if (this.onMessageCallback) this.onMessageCallback(chatId);
    if (this.onInboxUpdatedCallback) this.onInboxUpdatedCallback();

    try {
      // 4. Encrypt + upload full image
      const fullResult = await ImageEncryptionService.encryptAndUploadImage(uri, msgId, sharedSecret);
      if (!fullResult) throw new Error('Full image upload failed');

      // 5. Encrypt + upload thumbnail
      const thumbResult = await ImageEncryptionService.encryptAndUploadThumbnail(uri, msgId, sharedSecret);
      if (!thumbResult) throw new Error('Thumbnail upload failed');

      // 6. Encrypt caption if provided
      let encCaptionCipherText: string | undefined;
      let encCaptionIv: string | undefined;
      if (caption) {
        const encCaption = EncryptionService.encrypt(caption, sharedSecret);
        encCaptionCipherText = encCaption.cipherText;
        encCaptionIv = encCaption.iv;
      }

      // 7. Atomic RTDB write
      // No need to fetch current unread count; server-side increment handles this now.

      const previewText = caption ? `📷 ${caption}` : '📷 Photo';
      // Encrypt the preview for inbox (so inbox preview is also E2EE)
      const encPreview = EncryptionService.encrypt(previewText, sharedSecret);

      const updates: any = {};
      updates[`/messages/${chatId}/${msgId}`] = {
        senderId: myUid,
        type: 'image',
        thumbUrl: thumbResult.thumbUrl,
        fullUrl: fullResult.fullUrl,
        encThumbKey: thumbResult.encThumbKey,
        encThumbKeyIv: thumbResult.encThumbKeyIv,
        encImgKey: fullResult.encImgKey,
        encImgKeyIv: fullResult.encImgKeyIv,
        width,
        height,
        fileSize,
        ...(encCaptionCipherText && { encCaptionCipherText, encCaptionIv }),
        status: 1,
        timestamp,
      };
      updates[`/inbox/${myUid}/${contactUid}`] = {
        lastMessageCipherText: encPreview.cipherText,
        lastMessageIv: encPreview.iv,
        timestamp,
        unreadCount: 0,
      };
      updates[`/inbox/${contactUid}/${myUid}/lastMessageCipherText`] = encPreview.cipherText;
      updates[`/inbox/${contactUid}/${myUid}/lastMessageIv`] = encPreview.iv;
      updates[`/inbox/${contactUid}/${myUid}/timestamp`] = timestamp;
      updates[`/inbox/${contactUid}/${myUid}/unreadCount`] = database.ServerValue.increment(1);

      await database().ref().update(updates);

      // 8. Update local SQLite with real URLs + keys + local paths for sender
      LocalDBService.saveMessage({
        id: msgId,
        chatId,
        senderId: myUid,
        text: '',
        image: uri,
        timestamp,
        status: 1,
        type: 'image',
        imageWidth: width,
        imageHeight: height,
        caption: caption || null,
        thumbUrl: thumbResult.thumbUrl,
        fullUrl: fullResult.fullUrl,
        encThumbKey: thumbResult.encThumbKey,
        encThumbKeyIv: thumbResult.encThumbKeyIv,
        encImgKey: fullResult.encImgKey,
        encImgKeyIv: fullResult.encImgKeyIv,
        thumbLocalPath: localThumbPath, // Sender: use original as thumb proxy
        imageLocalPath: localFullPath,  // Sender: will be populated on first view
        pendingSeenSync: 0,
        pendingPush: 0,
      });

      if (this.onMessageCallback) this.onMessageCallback(chatId);

      // 9. Trigger push notification
      this.triggerImagePushNotification(contactUid, myUid, chatId, msgId, thumbResult.thumbUrl).catch(() => {});

      return msgId;
    } catch (err) {
      console.error('[MSS] sendImageMessage error:', err);
      // Mark as failed in SQLite
      LocalDBService.updateMessageStatus(msgId, -1);
      if (this.onMessageCallback) this.onMessageCallback(chatId);
      return null;
    }
  }

  // ── Download & Cache Helpers ───────────────────────────────────────────────

  /**
   * Background-downloads and decrypts the THUMBNAIL for a received image message.
   * Called automatically when a new image message arrives via RTDB listener.
   */
  public async downloadAndCacheThumb(
    msg: CachedMessage,
    sharedSecret: Uint8Array
  ): Promise<string | null> {
    if (!msg.thumbUrl || !msg.encThumbKey || !msg.encThumbKeyIv) return null;
    // Skip if already cached
    if (msg.thumbLocalPath) return msg.thumbLocalPath;

    const thumbPath = ImageEncryptionService.getThumbCachePath(msg.id);
    const base64 = await ImageEncryptionService.downloadAndDecrypt(
      msg.thumbUrl,
      msg.encThumbKey,
      msg.encThumbKeyIv,
      sharedSecret,
      thumbPath
    );

    if (base64) {
      LocalDBService.updateImageCache(msg.id, thumbPath, undefined);
      if (this.onMessageCallback) this.onMessageCallback(msg.chatId);
      return thumbPath;
    }
    return null;
  }

  /**
   * On-demand full image download + decrypt.
   * Called when the user taps a thumbnail to view the full image.
   * Returns base64 JPEG string.
   */
  public async downloadAndCacheFullImage(
    msg: CachedMessage,
    sharedSecret: Uint8Array
  ): Promise<string | null> {
    if (!msg.fullUrl || !msg.encImgKey || !msg.encImgKeyIv) return null;

    const fullPath = ImageEncryptionService.getFullCachePath(msg.id);
    const base64 = await ImageEncryptionService.downloadAndDecrypt(
      msg.fullUrl,
      msg.encImgKey,
      msg.encImgKeyIv,
      sharedSecret,
      fullPath
    );

    if (base64) {
      LocalDBService.updateImageCache(msg.id, undefined, fullPath);
      return base64;
    }
    return null;
  }

  /**
   * Triggers a push notification for an image message.
   * Does NOT send image content — only a '📷 Photo' preview.
   */
  private async triggerImagePushNotification(
    receiverId: string,
    senderId: string,
    chatId: string,
    msgId: string,
    imageUrl?: string
  ) {
    try {
      const me = LocalDBService.getContactByUid(senderId);
      const myName = me?.name || 'New Message';
      const myPhone = me?.phoneNumber || '';

      await fetch('https://push-notification-dvsr.onrender.com/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId,
          senderId,
          senderName: myName,
          senderPhone: myPhone,
          chatId,
          msgId,
          type: 'encrypted_chat',
          isImage: 'true',
          imageUrl: imageUrl || '',
        }),
      });
      console.log('[MSS] Image push notification triggered.');
    } catch (err) {
      console.error('[MSS] Image push error:', err);
    }
  }

  // ── Send Text Message ──────────────────────────────────────────────────────

  public async sendMessage(
    myUid: string, 
    contactUid: string, 
    text: string, 
    preGeneratedId?: string, 
    preGeneratedTimestamp?: number
  ) {

    const chatId = this.getChatId(myUid, contactUid);
    let sharedSecret = this.sharedSecretCache.get(chatId);

    if (!sharedSecret) {
      const contactPubKey = await EncryptionService.getContactPublicKey(contactUid);
      if (!contactPubKey) throw new Error('Recipient public key not found');
      const secret = await EncryptionService.getSharedSecret(myUid, contactPubKey);
      if (!secret) throw new Error('Shared secret generation failed');
      sharedSecret = secret;
      this.sharedSecretCache.set(chatId, sharedSecret);
    }

    const encrypted = EncryptionService.encrypt(text, sharedSecret);
    const msgId = preGeneratedId || database().ref(`messages/${chatId}`).push().key!;
    const timestamp = preGeneratedTimestamp || Date.now();


    // 1. Local-first: save plaintext to SQLite (only device stores plaintext)
    LocalDBService.saveMessage({
      id: msgId,
      chatId,
      senderId: myUid,
      text,
      image: null,
      timestamp,
      status: 0, // 0 = Pending/Waiting
      pendingSeenSync: 0,
      type: 'text',
      pendingPush: 0
    });

    // 2. Update sender's local SQLite contact preview (plaintext, only on this device)
    LocalDBService.updateContactLastMessage(contactUid, text);

    // 3. Mark contact chatInit=1 (so it appears on HomeScreen)
    const contact = LocalDBService.getContactByUid(contactUid);
    if (contact?.phoneNumber) {
      LocalDBService.updateChatInit(contact.phoneNumber, true);
    }

    // 4. Atomic RTDB write — message + my own inbox
    const inboxPayloadBase = {
      lastMessageCipherText: encrypted.cipherText,
      lastMessageIv: encrypted.iv,
      timestamp,
    };

    // Safely execute an offline-compatible Unread increment instead of using .transaction()
    // Transaction() drops writes if the app is killed while offline!
    // No need to fetch current unread count; server-side increment handles this now.

    const updates: any = {};
    updates[`/messages/${chatId}/${msgId}`] = {
      senderId: myUid,
      cipherText: encrypted.cipherText,
      iv: encrypted.iv,
      status: 1,
      timestamp,
      type: 'text',
    };
    updates[`/inbox/${myUid}/${contactUid}`] = {
      ...inboxPayloadBase,
      unreadCount: 0,
    };
    // Send payload to recipient's inbox atomically
    updates[`/inbox/${contactUid}/${myUid}/lastMessageCipherText`] = encrypted.cipherText;
    updates[`/inbox/${contactUid}/${myUid}/lastMessageIv`] = encrypted.iv;
    updates[`/inbox/${contactUid}/${myUid}/timestamp`] = timestamp;
    updates[`/inbox/${contactUid}/${myUid}/unreadCount`] = database.ServerValue.increment(1);

    // Execute RTDB update but don't block the UI
    database().ref().update(updates).then(() => {
      // Upon reaching server, locally set status to Sent (1)
      LocalDBService.updateMessageStatus(msgId, 1);
      if (this.onMessageCallback) this.onMessageCallback(chatId);
    }).catch(e => console.error('[MSS] Offline RTDB payload queued natively', e));

    this.triggerPushNotification(contactUid, myUid, encrypted, chatId, msgId).catch(e => {
      console.log("Offline: caching push notification for later", e);
      LocalDBService.updatePendingPush(msgId, 1);
    });

    // Instantly notify HomeScreen UI that local DB was updated
    if (this.onInboxUpdatedCallback) this.onInboxUpdatedCallback();

    return msgId;
  }




  private async triggerPushNotification(
    receiverId: string,
    senderId: string,
    encrypted: { cipherText: string; iv: string },
    chatId: string,
    msgId: string
  ) {
    try {
      // 1. Get sender name from Local SQLite to show in the notification title
      const me = LocalDBService.getContactByUid(senderId);
      const senderName = me?.name || "New Message";

      // 2. Send the encrypted payload to your Node.js server
      await fetch('https://push-notification-dvsr.onrender.com/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: receiverId,
          senderId: senderId,
          senderName: senderName,      // Plaintext name is okay for the UI
          senderPhone: me?.phoneNumber || '',
          cipherText: encrypted.cipherText, // Encrypted!
          iv: encrypted.iv,                 // Encrypted!
          chatId: chatId,
          msgId: msgId,
          type: 'encrypted_chat'            // Standardized type
        }),
      });

      console.log("[Push] Encrypted notification triggered successfully.");
    } catch (error) {
      console.error("Push API Error:", error);
    }
  }

  // ── Active Chat & Read Receipts ────────────────────────────────────────────

  public setActiveChat(chatId: string | null) {
    this.activeChatId = chatId;
    if (chatId) {
      this.syncPendingReadReceipts(chatId);
      // Mark all existing unread messages in this chat as read
      this.markAllAsRead(chatId);
    }
  }

  /**
   * Mark all incoming messages in the active chat as delivered/read on RTDB.
   */
  private async markAllAsRead(chatId: string) {
    if (!this.activeMyUid) return;
    const myUid = this.activeMyUid;
    const contactUid = this.getContactUidFromChatId(chatId, myUid);

    try {
      // 1. Reset unread count in RTDB inbox immediately
      await database().ref(`/inbox/${myUid}/${contactUid}`).update({ unreadCount: 0 });

      // 2. Fetch only messages that need status update (status < 3 and not sent by me)
      const snapshot = await database()
        .ref(`messages/${chatId}`)
        .orderByChild('status')
        .endAt(2) // Only messages with status 1 (Sent) or 2 (Delivered)
        .once('value');
        
      const data = snapshot.val();
      const existingContact = LocalDBService.getContactByUid(contactUid);

      if (!data) {
        // Even if no new messages found, reset local unread count without wiping lastMessage
        LocalDBService.updateContactMetadata(contactUid, existingContact?.lastMessage || '', 0);
        if (this.onInboxUpdatedCallback) this.onInboxUpdatedCallback();
        return;
      }

      const updates: any = {};
      let count = 0;
      Object.entries(data).forEach(([msgId, msg]: [string, any]) => {
        if (msg.senderId !== myUid && msg.status < 3) {
          updates[`/messages/${chatId}/${msgId}/status`] = 3;
          count++;
        }
      });

      if (count > 0) {
        await database().ref().update(updates);
        console.log(`[MSS] Marked ${count} messages as read.`);
      }

      // 3. Reset unread count in SQLite (already zeroed above if !data, but do here for safety)
      LocalDBService.updateContactMetadata(contactUid, existingContact?.lastMessage || '', 0);
      
      if (this.onInboxUpdatedCallback) this.onInboxUpdatedCallback();

    } catch (err) {
      console.error('[MSS] markAllAsRead error:', err);
    }
  }

  private getContactUidFromChatId(chatId: string, myUid: string): string {
    const parts = chatId.split('_');
    return parts.find(p => p !== myUid) || '';
  }

  private async markMessageAsRead(chatId: string, msgId: string) {
    try {
      await database().ref(`messages/${chatId}/${msgId}`).update({ status: 3 });
    } catch {
      LocalDBService.saveMessage({ id: msgId, pendingSeenSync: 1 } as any);
    }
  }

  private async syncPendingReadReceipts(chatId: string) {
    const pendingIds = LocalDBService.getPendingSeenMessages(chatId);
    if (pendingIds.length === 0) return;

    const updates: any = {};
    pendingIds.forEach(id => {
      updates[`/messages/${chatId}/${id}/status`] = 3;
    });

    try {
      await database().ref().update(updates);
      LocalDBService.markMessagesAsSynced(pendingIds);
    } catch (err) {
      console.error('[MSS] syncPendingReadReceipts error:', err);
    }
  }

  // ── Connectivity ───────────────────────────────────────────────────────────

  public monitorConnectivity() {
    database().ref('.info/connected').on('value', (snap) => {
      if (snap.val() === true) {
        console.log('[MSS] RTDB Online.');
      }
    });

    NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) {
        this.syncPendingPushNotifications();
      }
    });
  }

  public async syncPendingPushNotifications() {
    const pending = LocalDBService.getPendingPushMessages();
    if (pending.length === 0) return;

    console.log(`[MSS] Found ${pending.length} pending push notifications to sync.`);
    for (const msg of pending) {
      const contactUid = this.getContactUidFromChatId(msg.chatId, msg.senderId);
      if (!contactUid) continue;

      try {
        const contactPubKey = await EncryptionService.getContactPublicKey(contactUid);
        if (!contactPubKey) continue;
        const sharedSecret = await EncryptionService.getSharedSecret(msg.senderId, contactPubKey);
        if (!sharedSecret) continue;

        const encrypted = EncryptionService.encrypt(msg.text, sharedSecret);

        await this.triggerPushNotification(contactUid, msg.senderId, encrypted, msg.chatId, msg.id);
        LocalDBService.updatePendingPush(msg.id, 0);
        console.log(`[MSS] Successfully synced pending push for msg: ${msg.id}`);
      } catch (err) {
        console.warn(`[MSS] Still offline or failed to sync push for msg: ${msg.id}`, err);
      }
    }
  }
}

export default new MessageSyncService();

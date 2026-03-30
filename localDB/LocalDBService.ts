import { open } from 'react-native-quick-sqlite';

const DB_NAME = 'contacts.db';

export interface LocalContact {
  phoneNumber: string; // Used as unique identifier from contacts
  firebase_uid?: string | null;
  name: string;
  photo?: string | null;
  isRegistered: number; // 0 or 1
  chatInit: number;    // 0 or 1
  lastSync: number;    // timestamp
  unreadCount?: number;
  lastMessage?: string | null;
  chatTimestamp?: number | null;
  chatDeletedAt?: number | null; // Tombstone for "Clear Chat"
}

export interface CallLog {
  id: string;
  contactUid: string;
  contactName: string;
  contactPhoto: string | null;
  callType: string;      // 'video' | 'audio'
  direction: string;    // 'outgoing' | 'incoming'
  status: string;       // 'completed' | 'missed' | 'declined'
  startedAt: number;
  duration: number;     // seconds
}

export interface CachedMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  image: string | null;
  timestamp: number;
  status: number; // 0: Pending, 1: Sent, 2: Delivered, 3: Read
  pendingSeenSync?: number; // 0 or 1
  type?: string;
  pendingPush?: number; // 0 or 1
  // ── Image fields ─────────────────────────────────────────────────────────
  thumbLocalPath?: string | null;  // Local filesystem path to cached thumbnail
  imageLocalPath?: string | null;  // Local filesystem path to cached full image
  imageWidth?: number | null;      // Original image width (for aspect-ratio placeholder)
  imageHeight?: number | null;     // Original image height
  // Encrypted key data (stored so we can decrypt on re-open without re-fetching RTDB)
  thumbUrl?: string | null;        // Cloudinary URL for encrypted thumbnail blob
  fullUrl?: string | null;         // Cloudinary URL for encrypted full image blob
  encThumbKey?: string | null;     // Packed wrapped AES key for thumbnail
  encThumbKeyIv?: string | null;   // Wrap IV for thumbnail key
  encImgKey?: string | null;       // Packed wrapped AES key for full image
  encImgKeyIv?: string | null;     // Wrap IV for full image key
  caption?: string | null;         // Optional image caption (stored decrypted)
}

class LocalDBService {
  private static instance: LocalDBService;
  private db: any;

  private constructor() {
    this.db = open({ name: DB_NAME });
    this.initDB();
  }

  public static getInstance(): LocalDBService {
    if (!LocalDBService.instance) {
      LocalDBService.instance = new LocalDBService();
    }
    return LocalDBService.instance;
  }

  private initDB() {
    console.log('[LocalDBService] Initializing Database...');
    try {
      // 1. Core Tables
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS contacts (
          phoneNumber TEXT PRIMARY KEY,
          firebase_uid TEXT,
          name TEXT,
          photo TEXT,
          isRegistered INTEGER DEFAULT 0,
          chatInit INTEGER DEFAULT 0,
          lastSync INTEGER,
          unreadCount INTEGER DEFAULT 0,
          lastMessage TEXT,
          chatTimestamp INTEGER,
          chatDeletedAt INTEGER DEFAULT 0
        );
      `);

      this.db.execute(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          chatId TEXT,
          senderId TEXT,
          text TEXT,
          image TEXT,
          timestamp INTEGER,
          status INTEGER,
          pendingSeenSync INTEGER DEFAULT 0,
          type TEXT,
          pendingPush INTEGER DEFAULT 0,
          thumbLocalPath TEXT,
          imageLocalPath TEXT,
          imageWidth INTEGER,
          imageHeight INTEGER,
          thumbUrl TEXT,
          fullUrl TEXT,
          encThumbKey TEXT,
          encThumbKeyIv TEXT,
          encImgKey TEXT,
          encImgKeyIv TEXT,
          caption TEXT
        );
      `);

      // 4. Tombstone Table (for "Delete for Me")
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS deleted_messages (
          id TEXT PRIMARY KEY
        );
      `);

      // 5. Metadata Table (for Global Sync Epochs)
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);

      // 6. Call logs table
      this.db.execute(`
        CREATE TABLE IF NOT EXISTS call_logs (
          id TEXT PRIMARY KEY,
          contactUid TEXT,
          contactName TEXT,
          contactPhoto TEXT,
          callType TEXT DEFAULT "audio",
          direction TEXT DEFAULT "outgoing",
          status TEXT DEFAULT "completed",
          startedAt INTEGER,
          duration INTEGER DEFAULT 0
        );
      `);

      // indices
      try {
        this.db.execute('CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON messages (chatId, timestamp);');
      } catch (e) { console.warn('Index chat_timestamp failed:', e); }

      try {
        // Partial index (Requires SQLite 3.8.0+)
        this.db.execute('CREATE INDEX IF NOT EXISTS idx_pending_seen ON messages (pendingSeenSync) WHERE pendingSeenSync = 1;');
      } catch (e) { console.warn('Partial index pending_seen failed:', e); }

      // 3. Robust Migrations for contacts table
      const contactInfo = this.db.execute('PRAGMA table_info(contacts)');
      const contactColumns = (contactInfo.rows?._array || []).map((col: any) => col.name);

      const contactMigrations = [
        { name: 'firebase_uid', type: 'TEXT' },
        { name: 'photo', type: 'TEXT' },
        { name: 'unreadCount', type: 'INTEGER DEFAULT 0' },
        { name: 'lastMessage', type: 'TEXT' },
        { name: 'chatTimestamp', type: 'INTEGER' },
        { name: 'chatDeletedAt', type: 'INTEGER DEFAULT 0' }
      ];

      contactMigrations.forEach(m => {
        if (!contactColumns.includes(m.name)) {
          try {
            console.log(`[LocalDBService] Migrating: Adding ${m.name} to contacts...`);
            this.db.execute(`ALTER TABLE contacts ADD COLUMN ${m.name} ${m.type}`);
          } catch (e) {
            console.error(`Migration for ${m.name} in contacts failed:`, e);
          }
        }
      });

      // 4. Robust Migrations for messages table
      const msgInfo = this.db.execute('PRAGMA table_info(messages)');
      const msgColumns = (msgInfo.rows?._array || []).map((col: any) => col.name);

      const msgMigrations = [
        { name: 'pendingSeenSync', type: 'INTEGER DEFAULT 0' },
        { name: 'type', type: 'TEXT DEFAULT "text"' },
        { name: 'pendingPush', type: 'INTEGER DEFAULT 0' },
        { name: 'thumbLocalPath', type: 'TEXT' },
        { name: 'imageLocalPath', type: 'TEXT' },
        { name: 'imageWidth', type: 'INTEGER' },
        { name: 'imageHeight', type: 'INTEGER' },
        { name: 'thumbUrl', type: 'TEXT' },
        { name: 'fullUrl', type: 'TEXT' },
        { name: 'encThumbKey', type: 'TEXT' },
        { name: 'encThumbKeyIv', type: 'TEXT' },
        { name: 'encImgKey', type: 'TEXT' },
        { name: 'encImgKeyIv', type: 'TEXT' },
        { name: 'caption', type: 'TEXT' },
      ];

      msgMigrations.forEach(m => {
        if (!msgColumns.includes(m.name)) {
          try {
            console.log(`[LocalDBService] Migrating: Adding ${m.name} to messages...`);
            this.db.execute(`ALTER TABLE messages ADD COLUMN ${m.name} ${m.type}`);
          } catch (e) {
            console.error(`Migration for ${m.name} in messages failed:`, e);
          }
        }
      });

      // 5. Migrations for call_logs table
      try {
        const callLogInfo = this.db.execute('PRAGMA table_info(call_logs)');
        const callLogCols = (callLogInfo.rows?._array || []).map((col: any) => col.name);
        const callLogMigrations = [
          { name: 'contactPhoto', type: 'TEXT' },
          { name: 'callType', type: 'TEXT DEFAULT "audio"' },
          { name: 'direction', type: 'TEXT DEFAULT "outgoing"' },
          { name: 'status', type: 'TEXT DEFAULT "completed"' },
          { name: 'duration', type: 'INTEGER DEFAULT 0' },
        ];
        callLogMigrations.forEach(m => {
          if (!callLogCols.includes(m.name)) {
            try { this.db.execute(`ALTER TABLE call_logs ADD COLUMN ${m.name} ${m.type}`); } catch (e) {}
          }
        });
      } catch (e) { console.warn('call_logs migration check failed:', e); }

      console.log('SQLite Database initialized successfully');
    } catch (error) {
      console.error('CRITICAL: Failed to initialize SQLite database:', error);
    }
  }

  public upsertContacts(contacts: Partial<LocalContact>[]) {
    try {
      this.db.transaction((tx: any) => {
        contacts.forEach((contact) => {
          tx.execute(`
            INSERT INTO contacts (phoneNumber, firebase_uid, name, photo, isRegistered, chatInit, lastSync, unreadCount, lastMessage, chatTimestamp, chatDeletedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(phoneNumber) DO UPDATE SET
              firebase_uid = COALESCE(excluded.firebase_uid, firebase_uid),
              name = CASE 
                WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name 
                ELSE name 
              END,
              photo = CASE
                WHEN excluded.photo IS NOT NULL THEN excluded.photo
                ELSE photo
              END,
              isRegistered = CASE 
                WHEN excluded.isRegistered != 0 THEN excluded.isRegistered 
                ELSE isRegistered 
              END,
              chatInit = CASE 
                WHEN excluded.chatInit != 0 THEN excluded.chatInit 
                ELSE chatInit 
              END,
              lastSync = excluded.lastSync,
              unreadCount = COALESCE(excluded.unreadCount, unreadCount),
              lastMessage = COALESCE(excluded.lastMessage, lastMessage),
              chatTimestamp = COALESCE(excluded.chatTimestamp, chatTimestamp),
              chatDeletedAt = COALESCE(excluded.chatDeletedAt, chatDeletedAt);
          `, [
            contact.phoneNumber,
            contact.firebase_uid || null,
            contact.name || null,
            contact.photo || null,
            contact.isRegistered ?? 0,
            contact.chatInit ?? 0,
            contact.lastSync ?? Date.now(),
            contact.unreadCount ?? null,
            contact.lastMessage || null,
            contact.chatTimestamp || null,
            contact.chatDeletedAt ?? 0
          ]);
        });
      });
    } catch (error) {
      console.error('Error upserting contacts:', error);
    }
  }

  public getRegisteredUsers(): LocalContact[] {
    try {
      const { rows } = this.db.execute('SELECT * FROM contacts WHERE isRegistered = 1 ORDER BY name ASC');
      return rows?._array || [];
    } catch (error) {
      console.error('Error fetching registered users:', error);
      return [];
    }
  }

  public getContactByPhone(phoneNumber: string): LocalContact | null {
    try {
      const { rows } = this.db.execute('SELECT * FROM contacts WHERE phoneNumber = ?', [phoneNumber]);
      return rows?._array[0] || null;
    } catch (error) {
      console.error('Error fetching contact by phone:', error);
      return null;
    }
  }

  public getUnknownNumbers(): string[] {
    try {
      // Numbers NOT in SQLite OR numbers where firebase_uid is null/empty
      const { rows } = this.db.execute('SELECT phoneNumber FROM contacts WHERE firebase_uid IS NULL OR firebase_uid = ""');
      return (rows?._array || []).map((row: any) => row.phoneNumber);
    } catch (error) {
      console.error('Error fetching unknown numbers:', error);
      return [];
    }
  }

  public getRegisteredCount(): number {
    try {
      const { rows } = this.db.execute('SELECT COUNT(*) as count FROM contacts WHERE isRegistered = 1');
      return rows?._array[0]?.count || 0;
    } catch (error) {
      console.error('Error counting registered users:', error);
      return 0;
    }
  }

  public getChatCount(): number {
    try {
      const { rows } = this.db.execute('SELECT COUNT(*) as count FROM contacts WHERE chatInit = 1');
      return rows?._array[0]?.count || 0;
    } catch (error) {
      console.error('Error counting chat users:', error);
      return 0;
    }
  }

  public getChatUsers(): LocalContact[] {
    try {
      this.db.execute('UPDATE contacts SET chatTimestamp = lastSync WHERE chatTimestamp IS NULL AND chatInit = 1');
      const { rows } = this.db.execute('SELECT * FROM contacts WHERE chatInit = 1');
      const users: LocalContact[] = rows?._array || [];
      return users.sort((a, b) => (b.chatTimestamp || 0) - (a.chatTimestamp || 0));
    } catch (error) {
      console.error('Error fetching chat users:', error);
      return [];
    }
  }

  public updateChatInit(phoneNumber: string, status: boolean) {
    try {
      this.db.execute(
        'UPDATE contacts SET chatInit = ?, chatTimestamp = ? WHERE phoneNumber = ?',
        [status ? 1 : 0, Date.now(), phoneNumber]
      );
    } catch (error) {
      console.error('Error updating chatInit:', error);
    }
  }

  // --- Message Caching Methods ---

  public getPendingMessages(): CachedMessage[] {
    try {
      const { rows } = this.db.execute('SELECT * FROM messages WHERE status = 0');
      return rows?._array || [];
    } catch (e) { return []; }
  }

  public getPendingPushMessages(): CachedMessage[] {
    try {
      const { rows } = this.db.execute('SELECT * FROM messages WHERE pendingPush = 1');
      return rows?._array || [];
    } catch (e) { return []; }
  }

  public updatePendingPush(id: string, value: number) {
    try {
      this.db.execute('UPDATE messages SET pendingPush = ? WHERE id = ?', [value, id]);
    } catch (e) {}
  }

  public updateMessageStatus(id: string, status: number) {
    try {
      this.db.execute('UPDATE messages SET status = ? WHERE id = ?', [status, id]);
    } catch (error) {
      console.error('Error updating message status:', error);
    }
  }

  public saveMessage(msg: CachedMessage) {
    try {
      this.db.execute(`
        INSERT INTO messages (
          id, chatId, senderId, text, image, timestamp, status,
          pendingSeenSync, type, pendingPush,
          thumbLocalPath, imageLocalPath, imageWidth, imageHeight,
          thumbUrl, fullUrl, encThumbKey, encThumbKeyIv, encImgKey, encImgKeyIv, caption
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          pendingSeenSync = excluded.pendingSeenSync,
          pendingPush = excluded.pendingPush,
          thumbLocalPath = COALESCE(excluded.thumbLocalPath, thumbLocalPath),
          imageLocalPath = COALESCE(excluded.imageLocalPath, imageLocalPath),
          imageWidth = COALESCE(excluded.imageWidth, imageWidth),
          imageHeight = COALESCE(excluded.imageHeight, imageHeight),
          thumbUrl = COALESCE(excluded.thumbUrl, thumbUrl),
          fullUrl = COALESCE(excluded.fullUrl, fullUrl),
          encThumbKey = COALESCE(excluded.encThumbKey, encThumbKey),
          encThumbKeyIv = COALESCE(excluded.encThumbKeyIv, encThumbKeyIv),
          encImgKey = COALESCE(excluded.encImgKey, encImgKey),
          encImgKeyIv = COALESCE(excluded.encImgKeyIv, encImgKeyIv),
          caption = COALESCE(excluded.caption, caption);
      `, [
        msg.id,
        msg.chatId,
        msg.senderId,
        msg.text,
        msg.image || null,
        msg.timestamp,
        msg.status,
        msg.pendingSeenSync ?? 0,
        msg.type || 'text',
        msg.pendingPush ?? 0,
        msg.thumbLocalPath || null,
        msg.imageLocalPath || null,
        msg.imageWidth || null,
        msg.imageHeight || null,
        msg.thumbUrl || null,
        msg.fullUrl || null,
        msg.encThumbKey || null,
        msg.encThumbKeyIv || null,
        msg.encImgKey || null,
        msg.encImgKeyIv || null,
        msg.caption || null,
      ]);
    } catch (error) {
      console.error('Error saving message to SQLite:', error);
    }
  }

  /**
   * Updates only the image cache paths for a specific message.
   * Called after thumbnail or full image is downloaded and decrypted.
   */
  public updateImageCache(
    msgId: string,
    thumbLocalPath?: string | null,
    imageLocalPath?: string | null
  ) {
    try {
      if (thumbLocalPath !== undefined && imageLocalPath !== undefined) {
        this.db.execute(
          'UPDATE messages SET thumbLocalPath = ?, imageLocalPath = ? WHERE id = ?',
          [thumbLocalPath, imageLocalPath, msgId]
        );
      } else if (thumbLocalPath !== undefined) {
        this.db.execute(
          'UPDATE messages SET thumbLocalPath = ? WHERE id = ?',
          [thumbLocalPath, msgId]
        );
      } else if (imageLocalPath !== undefined) {
        this.db.execute(
          'UPDATE messages SET imageLocalPath = ? WHERE id = ?',
          [imageLocalPath, msgId]
        );
      }
    } catch (error) {
      console.error('Error updating image cache paths:', error);
    }
  }

  public getCachedMessages(chatId: string, limit: number = 20, offset: number = 0): CachedMessage[] {
    try {
      const { rows } = this.db.execute(
        'SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        [chatId, limit, offset]
      );
      return rows?._array || [];
    } catch (error) {
      console.error('Error fetching cached messages:', error);
      return [];
    }
  }

  public getLatestMessageTimestamp(chatId: string): number {
    try {
      const { rows } = this.db.execute(
        'SELECT MAX(timestamp) as max_ts FROM messages WHERE chatId = ?',
        [chatId]
      );
      return rows?._array[0]?.max_ts || 0;
    } catch (error) {
      console.error('Error fetching latest message timestamp:', error);
      return 0;
    }
  }

  public getMessagesByIds(ids: string[]): CachedMessage[] {
    if (ids.length === 0) return [];
    try {
      const placeholders = ids.map(() => '?').join(',');
      const { rows } = this.db.execute(
        `SELECT * FROM messages WHERE id IN (${placeholders})`,
        ids
      );
      return rows?._array || [];
    } catch (error) {
      console.error('Error fetching messages by ids:', error);
      return [];
    }
  }

  public deleteMessages(ids: string[], contactUid?: string) {
    if (ids.length === 0) return;
    try {
      this.db.transaction((tx: any) => {
        ids.forEach(id => {
          tx.execute('DELETE FROM messages WHERE id = ?', [id]);
          // Add to tombstone
          tx.execute('INSERT OR IGNORE INTO deleted_messages (id) VALUES (?)', [id]);
        });
      });
      // Correct the last message preview for the contact
      if (contactUid) {
        this.updateContactToLatestMessage(contactUid);
      }
    } catch (error) {
      console.error('Error deleting messages:', error);
    }
  }

  public isMessageDeleted(msgId: string): boolean {
    try {
      const { rows } = this.db.execute('SELECT id FROM deleted_messages WHERE id = ?', [msgId]);
      return (rows?._array.length || 0) > 0;
    } catch (error) {
      return false;
    }
  }

  public deleteMessagesForChat(chatId: string) {
    try {
      // 1. Get all message IDs for this chat
      const { rows } = this.db.execute('SELECT id FROM messages WHERE chatId = ?', [chatId]);
      const ids = (rows?._array || []).map((r: any) => r.id);
      
      this.db.transaction((tx: any) => {
        // 2. Delete messages
        tx.execute('DELETE FROM messages WHERE chatId = ?', [chatId]);
        // 3. Add to tombstone
        ids.forEach(id => {
          tx.execute('INSERT OR IGNORE INTO deleted_messages (id) VALUES (?)', [id]);
        });
      });
    } catch (error) {
      console.error('Error deleting messages for chat:', error);
    }
  }

  public getContactByUid(uid: string): LocalContact | null {
    try {
      const { rows } = this.db.execute('SELECT * FROM contacts WHERE firebase_uid = ?', [uid]);
      return rows?._array[0] || null;
    } catch (error) {
      console.error('Error fetching contact by uid:', error);
      return null;
    }
  }

  public updateContactMetadata(uid: string, lastMessage: string, unreadCount: number, timestamp?: number) {
    try {
      if (timestamp) {
        this.db.execute(
          'UPDATE contacts SET lastMessage = ?, unreadCount = ?, chatTimestamp = ? WHERE firebase_uid = ?',
          [lastMessage, unreadCount, timestamp, uid]
        );
      } else {
        this.db.execute(
          'UPDATE contacts SET lastMessage = ?, unreadCount = ? WHERE firebase_uid = ?',
          [lastMessage, unreadCount, uid]
        );
      }
    } catch (error) {
      console.error('Error updating contact metadata:', error);
    }
  }

  /** Updates only the lastMessage preview text for a contact (by UID). */
  public updateContactLastMessage(uid: string, lastMessage: string) {
    try {
      this.db.execute(
        'UPDATE contacts SET lastMessage = ?, chatTimestamp = ? WHERE firebase_uid = ?',
        [lastMessage, Date.now(), uid]
      );
    } catch (error) {
      console.error('Error updating contact lastMessage:', error);
    }
  }

  public markChatAsDeleted(uid: string) {
    try {
      this.db.execute(
        'UPDATE contacts SET lastMessage = "", unreadCount = 0, chatDeletedAt = ?, chatInit = 0 WHERE firebase_uid = ?',
        [Date.now(), uid]
      );
    } catch (error) {
      console.error('Error marking chat as deleted:', error);
    }
  }

  /**
   * Finds the latest message for a contact in SQLite and updates the contact's preview.
   * Useful after deleting messages.
   */
  public updateContactToLatestMessage(uid: string) {
    try {
      const contact = this.getContactByUid(uid);
      if (!contact || !contact.firebase_uid) return;

      // Find the latest message for this contact (either as sender or receiver)
      // Since chatId is sort(uid1, uid2), we can't easily query by chatId without the other UID.
      // But we can query by senderId or receiverId if we had the current user's UID.
      // However, messages table has chatId. If we don't have chatId, we can't easily find it.
      // Let's assume we can find the chatId from the existing contact or messages.
      
      const { rows: chatRows } = this.db.execute('SELECT DISTINCT chatId FROM messages WHERE senderId = ? OR chatId LIKE ?', [uid, `%${uid}%`]);
      if (chatRows?._array.length === 0) {
        this.updateContactMetadata(uid, '', 0);
        return;
      }

      const chatId = chatRows._array[0].chatId;
      const { rows: msgRows } = this.db.execute(
        'SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp DESC LIMIT 1',
        [chatId]
      );

      if (msgRows?._array.length > 0) {
        const latest = msgRows._array[0];
        const preview = latest.type === 'image' ? (latest.caption ? `📷 ${latest.caption}` : '📷 Photo') : latest.text;
        this.updateContactMetadata(uid, preview, contact.unreadCount || 0, latest.timestamp);
      } else {
        this.updateContactMetadata(uid, '', 0);
      }
    } catch (error) {
      console.error('Error updating contact to latest message:', error);
    }
  }

  public setGlobalDeletedAt(ts: number) {
    try {
      this.db.execute('INSERT OR REPLACE INTO metadata (key, value) VALUES ("globalDeletedAt", ?)', [ts.toString()]);
    } catch (error) {
      console.error('Error setting globalDeletedAt:', error);
    }
  }

  public getGlobalDeletedAt(): number {
    try {
      const { rows } = this.db.execute('SELECT value FROM metadata WHERE key = "globalDeletedAt"');
      return parseInt(rows?._array[0]?.value || '0', 10);
    } catch (error) {
      return 0;
    }
  }

  public getChatDeletedAt(uid: string): number {
    try {
      const { rows } = this.db.execute('SELECT chatDeletedAt FROM contacts WHERE firebase_uid = ?', [uid]);
      return rows?._array[0]?.chatDeletedAt || 0;
    } catch (error) {
      return 0;
    }
  }

  public getPendingSeenMessages(chatId: string): string[] {
    try {
      const { rows } = this.db.execute(
        'SELECT id FROM messages WHERE chatId = ? AND pendingSeenSync = 1',
        [chatId]
      );
      return (rows?._array || []).map((row: any) => row.id);
    } catch (error) {
      console.error('Error fetching pending seen messages:', error);
      return [];
    }
  }

  public markMessagesAsSynced(ids: string[]) {
    if (ids.length === 0) return;
    try {
      this.db.transaction((tx: any) => {
        ids.forEach(id => {
          tx.execute('UPDATE messages SET pendingSeenSync = 0 WHERE id = ?', [id]);
        });
      });
    } catch (error) {
      console.error('Error marking messages as synced:', error);
    }
  }

  // ── Call Log Methods ────────────────────────────────────────────────────────

  public saveCallLog(log: CallLog): void {
    try {
      this.db.execute(`
        INSERT INTO call_logs (id, contactUid, contactName, contactPhoto, callType, direction, status, startedAt, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          duration = excluded.duration;
      `, [
        log.id,
        log.contactUid,
        log.contactName,
        log.contactPhoto || null,
        log.callType,
        log.direction,
        log.status,
        log.startedAt,
        log.duration,
      ]);
    } catch (e) {
      console.error('[LocalDBService] saveCallLog error:', e);
    }
  }

  public getCallLogs(limit: number = 100): CallLog[] {
    try {
      const { rows } = this.db.execute(
        'SELECT * FROM call_logs ORDER BY startedAt DESC LIMIT ?',
        [limit],
      );
      return rows?._array || [];
    } catch (e) {
      console.error('[LocalDBService] getCallLogs error:', e);
      return [];
    }
  }

  public getMissedCallCount(): number {
    try {
      const { rows } = this.db.execute(
        'SELECT COUNT(*) as count FROM call_logs WHERE status = ? AND direction = ?',
        ['missed', 'incoming'],
      );
      return rows?._array[0]?.count || 0;
    } catch (e) {
      return 0;
    }
  }

  public deleteCallLog(id: string): void {
    try {
      this.db.execute('DELETE FROM call_logs WHERE id = ?', [id]);
    } catch (e) {
      console.error('[LocalDBService] deleteCallLog error:', e);
    }
  }

  public deleteCallLogs(ids: string[]): void {
    if (ids.length === 0) return;
    try {
      this.db.transaction((tx: any) => {
        ids.forEach(id => {
          tx.execute('DELETE FROM call_logs WHERE id = ?', [id]);
        });
      });
      console.log(`[LocalDBService] Deleted ${ids.length} call logs.`);
    } catch (e) {
      console.error('[LocalDBService] deleteCallLogs error:', e);
    }
  }

  public clearCallLogs(): void {
    try {
      this.db.execute('DELETE FROM call_logs');
    } catch (e) {
      console.error('[LocalDBService] clearCallLogs error:', e);
    }
  }

  // ── Full Reset ──────────────────────────────────────────────────────────────

  public clearAllData() {
    try {
      console.log('[LocalDBService] Wiping all local data for logout...');
      this.db.execute('DROP TABLE IF EXISTS contacts');
      this.db.execute('DROP TABLE IF EXISTS messages');
      this.db.execute('DROP TABLE IF EXISTS call_logs');
      this.initDB(); // Recreate tables
    } catch (error) {
      console.error('Error clearing database:', error);
    }
  }
}

export default LocalDBService.getInstance();

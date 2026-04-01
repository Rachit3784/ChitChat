import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidStyle, AndroidVisibility, EventType } from '@notifee/react-native';
import { Platform, PermissionsAndroid, AppState } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import * as Keychain from 'react-native-keychain';
import NavigationService from './NavigationService';
import LocalDBService from '../localDB/LocalDBService';
import EncryptionService from './chat/EncryptionService';
import MessageSyncService from './chat/MessageSyncService';
import { handleNotificationLogic } from './calling/NotificationHandler';

// This must match exactly what is in your EncryptionService
const KEYCHAIN_SERVICE_PRIVATE = 'secure_chat_private_key';
const NOTIFICATION_BRIDGE_URL = 'https://push-notification-dvsr.onrender.com';

/**
 * STANDALONE UNIVERSAL BACKGROUND HANDLER
 * This is the single, headless-safe entry point for all FCM messages in background/kill mode.
 * Being standalone (outside a class) is critical for reliability when the app is completely closed.
 */
export const handleBackgroundMessage = async (remoteMessage: any) => {
  console.log('[FCM] 🟠 HEADLESS BACKGROUND ARRIVED:', remoteMessage.data);

  const type = remoteMessage.data?.type;

  try {
    if (type === 'INCOMING_CALL') {
      await handleNotificationLogic(remoteMessage);
    }
    else if (type === 'CALL_CANCELLED') {
      const callId = remoteMessage.data?.callId as string;
      if (callId) {
        await notifee.stopForegroundService();
        await notifee.cancelNotification(callId);
      }
    }
    else if (type === 'encrypted_chat') {
      const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE_PRIVATE });
      const myUid = credentials ? credentials.username : null;

      // Even if myUid is missing, we proceed to display a "Locked" notification
      await notificationServiceReference.handleEncryptedNotification(remoteMessage, myUid, true);
    }
  } catch (e) {
    console.error('[FCM] Headless handler error:', e);
  }
};

class NotificationService {
  private lastToken: string | null = null;

  constructor() {
    this.setupMessageHandlers();
    this.initialize();
  }

  async initialize() {
    await this.createDefaultChannels();
    if (Platform.OS === 'ios') {
      await notifee.requestPermission();
    }
  }

  setupMessageHandlers() {
    // --- FOREGROUND MESSAGES ---
    messaging().onMessage(async (remoteMessage) => {
      console.log('[NotificationService] 🔵 FOREGROUND FCM ARRIVED:', remoteMessage.data);

      const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE_PRIVATE });
      const myUid = credentials ? credentials.username : null;

      // NOTE: INCOMING_CALL is handled exclusively in App.tsx to avoid double-notification.
      // This handler focuses only on chat notifications.
      if (remoteMessage.data?.type === 'CALL_CANCELLED') {
        const callId = remoteMessage.data?.callId as string;
        if (callId) {
          await notifee.stopForegroundService();
          await notifee.cancelNotification(callId);
        }
      }

      if (remoteMessage.data?.type === 'encrypted_chat' && myUid) {
        await this.handleEncryptedNotification(remoteMessage, myUid, false);
      }
    });

    // --- EVENT LISTENERS ---
    const handleEvent = ({ type, detail }: any) => {
      const { notification, pressAction } = detail;

      if (type === EventType.PRESS || (type === EventType.ACTION_PRESS && pressAction?.id === 'accept')) {
        if (notification?.data?.type === 'call') {
          this.handleNotificationPress(notification.data);
        } else if (notification?.data?.type === 'chat') {
          this.handleChatPress(notification.data, notification?.id);
        } else if (notification?.data?.type === 'missed_call') {
          this.handleMissedCallPress(notification?.id);
        }
      }

      if (type === EventType.ACTION_PRESS && pressAction?.id === 'decline') {
        this.handleDeclineCall(notification?.data);
      }
    };

    notifee.onForegroundEvent(handleEvent);
    // NOTE: onBackgroundEvent is registered as a standalone handler in index.js
    // (required by Notifee for headless background/killed-state execution).
  }

  /**
   * Universal Decryption and Display Logic with Resilience
   */
  async handleEncryptedNotification(remoteMessage: any, myUid: string | null, isBackground: boolean = false) {
    const { cipherText, iv, senderId, senderPhoto, senderPhone, senderName, chatId, msgId, isImage } = remoteMessage.data;
    console.log(`[NotificationService] Resilient Push Check: msgId=${msgId}, bg=${isBackground}`);

    try {
      await this.createDefaultChannels();
      const localContact = LocalDBService.getContactByUid(senderId);

      // Fallback Display Metadata
      const displayTitle = senderName || localContact?.name || senderPhone || 'Private Message';
      let finalBody = isImage === 'true' ? '📷 New Photo' : '🔒 New Encrypted Message (Tap to See)';

      // 1. Attempt Decryption only if myUid and keys are available
      if (myUid) {
        try {
          if (isImage === 'true') {
            finalBody = '📷 New Photo';
          } else {
            console.log('[NotificationService] Attempting Decryption...');
            const contactPubKey = await EncryptionService.getContactPublicKey(senderId);
            if (contactPubKey) {
              const sharedSecret = await EncryptionService.getSharedSecret(myUid, contactPubKey);
              if (sharedSecret) {
                const decryptedText = EncryptionService.decrypt({ cipherText, iv }, sharedSecret);
                if (decryptedText) finalBody = decryptedText;
              }
            }
          }
        } catch (decryptErr: any) {
          console.warn('[NotificationService] Decryption failed or timed out:', decryptErr.message);
          // Kept as fallback generic message
        }
      } else {
        console.warn('[NotificationService] SKIP Decrypt: UID missing or Keychain locked.');
      }

      const isForeground = !isBackground && AppState.currentState === 'active';
      const isCurrentChat = MessageSyncService.activeChatId === chatId;

      // 2. ALWAYS DISPLAY NOTIFICATION in background (even if decryption failed)
      if (!isForeground) {
        console.log('[NotificationService] Calling notifee.displayNotification...');
        await notifee.displayNotification({
          title: displayTitle,
          body: finalBody,
          id: msgId,
          android: {
            channelId: 'messages_v4',
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            largeIcon: (typeof senderPhoto === 'string' && senderPhoto.startsWith('http')) ? senderPhoto : undefined,
            pressAction: { id: 'default', launchActivity: 'default' },
            smallIcon: 'ic_launcher',
          },
          ios: { sound: 'default' },
          data: { type: 'chat', senderId, chatId },
        });
      }

      // 3. Update Sync Metadata (SQLite)
      if (myUid) {
        const unreadToSet = (isForeground && isCurrentChat) ? 0 : (localContact?.unreadCount || 0) + 1;
        LocalDBService.updateContactMetadata(senderId, finalBody, unreadToSet, Date.now());
        if (MessageSyncService.onInboxUpdatedCallback) MessageSyncService.onInboxUpdatedCallback();
      }

    } catch (error) {
      console.error('[NotificationService] Global notification error:', error);
    }
  }

  async handleChatPress(data: any, notificationId?: string) {
    if (!data) return;
    if (notificationId) await notifee.cancelNotification(notificationId);
    const contact = LocalDBService.getContactByUid(data.senderId);
    NavigationService.navigate('Main', {
      screen: 'Home',
      params: {
        contactUid: data.senderId,
        contactName: contact ? contact.name : 'Chat',
        chatId: data.chatId
      },
    });
  }

  async handleCallNotification(data: any) {
    const { receiverUid, senderName, senderId, callerPhoto, callType, callId } = data;
    const notificationId = callId || 'incoming-call';
    try {
      await notifee.displayNotification({
        id: notificationId,
        title: callType === 'video' ? '📹 Incoming Video Call' : '🎤 Incoming Voice Call',
        body: `${senderName} is calling you...`,
        data: {
          type: 'call',
          callId: notificationId,
          callerId: senderId,
          receiverId: receiverUid,
          callerName: senderName,
          callerPhoto: callerPhoto || null,
          callType: callType || 'audio',
        },
        android: {
          channelId: 'video_calls_v3',
          importance: AndroidImportance.HIGH,
          autoCancel: false,
          ongoing: true,
          largeIcon: (typeof callerPhoto === 'string' && callerPhoto.startsWith('http')) ? callerPhoto : undefined,
          fullScreenAction: { id: 'default' },
          actions: [
            { title: '✅ Accept', pressAction: { id: 'accept', launchActivity: 'default' } },
            { title: '❌ Decline', pressAction: { id: 'decline' } },
          ],
          style: { type: AndroidStyle.BIGTEXT, text: `${senderName} is calling you. Tap to answer.` },
          pressAction: { id: 'default' },
        },
        ios: {
          sound: 'default',
          interruptionLevel: 'timeSensitive',
        },
      });
    } catch (error) { console.error(error); }
  }

  async handleNotificationPress(data: any) {
    if (!data) return;
    const { callerId, receiverId, callerName, callerPhoto, callType, type, callId } = data;
    if (type === 'missed_call') {
      this.handleMissedCallPress();
      return;
    }
    const callIdToCancel = (callId as string) || (callerId < receiverId ? callerId + '_' + receiverId : receiverId + '_' + callerId);
    await notifee.cancelNotification(callIdToCancel);
    NavigationService.navigate('Screens', {
      screen: 'IncomingCallScreen',
      params: {
        callId: callIdToCancel,
        callerUid: callerId,
        callerName: callerName || 'Incoming Call',
        callerPhoto: callerPhoto || null,
        callType: callType || 'audio',
      },
    });
  }

  async handleMissedCallPress(notificationId?: string) {
    if (notificationId) await notifee.cancelNotification(notificationId);
    NavigationService.navigate('Main', { screen: 'Call' });
  }

  async handleDeclineCall(data: any) {
    if (!data) return;
    const { callerId, receiverId, callId } = data;
    const callIdToCancel = callId || (callerId < receiverId ? callerId + receiverId : receiverId + callerId);
    await firestore().collection('calls').doc(callIdToCancel).update({ status: 'ended' });
    await notifee.cancelNotification(callIdToCancel);
  }

  async saveTokenToDatabase(userId: string, token: string | null) {
    if (!userId || this.lastToken === token) return;
    try {
      await firestore().collection('users').doc(userId).set({
        userIdFCMtoken: token,
        tokenUpdatedAt: firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      this.lastToken = token;
    } catch (error) { console.error(error); }
  }

  async clearFCMToken(userId: string) {
    if (!userId) return;
    await this.saveTokenToDatabase(userId, null);
  }

  async createDefaultChannels() {
    if (Platform.OS === 'android') {
      await notifee.createChannel({
        id: 'messages_v4',
        name: 'Messages',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        vibration: true,
        sound: 'default',
      });
      await notifee.createChannel({
        id: 'video_calls_v3',
        name: 'Video Calls',
        importance: AndroidImportance.HIGH,
        vibration: true,
        bypassDnd: true,
        sound: 'default',
      });
    }
  }

  async requestPermission() {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }

  async getFCMToken() {
    try {
      const token = await messaging().getToken();
      return token;
    } catch (error) {
      console.error('[NotificationService] Error getting FCM token:', error);
      return null;
    }
  }

  async updateFCMToken(userId: string) {
    const token = await this.getFCMToken();
    if (token) {
      await this.saveTokenToDatabase(userId, token);
    }
  }
}

const notificationServiceReference = new NotificationService();
export default notificationServiceReference;

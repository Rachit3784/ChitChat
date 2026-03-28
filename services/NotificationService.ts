import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidStyle, AndroidVisibility, EventType } from '@notifee/react-native';
import { Platform, PermissionsAndroid, AppState } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import * as Keychain from 'react-native-keychain';
import NavigationService from './NavigationService';
import LocalDBService from '../localDB/LocalDBService';
import EncryptionService from './chat/EncryptionService';
import MessageSyncService from './chat/MessageSyncService';

// This must match exactly what is in your EncryptionService
const KEYCHAIN_SERVICE_PRIVATE = 'secure_chat_private_key';

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
    // --- BACKGROUND MESSAGES ---
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('[NotificationService] Background message:', remoteMessage);

      const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE_PRIVATE });
      const myUid = credentials ? credentials.username : null;

      if (remoteMessage.data?.type === 'call') {
        const notifType = remoteMessage.data?.notificationType;
        if (notifType === 'call_cancelled' || notifType === 'call_missed') {
          // Caller cancelled before pickup — silently dismiss the incoming-call notification
          await notifee.cancelNotification('incoming-call');
        } else {
          await this.handleCallNotification(remoteMessage.data);
        }
      } else if (remoteMessage.data?.type === 'encrypted_chat' && myUid) {
        await this.handleEncryptedNotification(remoteMessage, myUid);
      }
    });

    // --- FOREGROUND MESSAGES ---
    messaging().onMessage(async (remoteMessage) => {
      console.log('[NotificationService] Foreground message:', remoteMessage);

      const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE_PRIVATE });
      const myUid = credentials ? credentials.username : null;

      if (remoteMessage.data?.type === 'call') {
        const notifType = remoteMessage.data?.notificationType;
        if (notifType === 'call_cancelled' || notifType === 'call_missed') {
          // Dismiss any pending notification and let IncomingCallOverlay handle the rest
          await notifee.cancelNotification('incoming-call');
        } else {
          await this.handleCallNotification(remoteMessage.data);
        }
      } else if (remoteMessage.data?.type === 'encrypted_chat' && myUid) {
        await this.handleEncryptedNotification(remoteMessage, myUid);
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
        }
      }

      if (type === EventType.ACTION_PRESS && pressAction?.id === 'decline') {
        this.handleDeclineCall(notification?.data);
      }
    };

    notifee.onForegroundEvent(handleEvent);
    notifee.onBackgroundEvent(async (event) => handleEvent(event));
  }

  async handleEncryptedNotification(remoteMessage: any, myUid: string) {
    const { cipherText, iv, senderId, senderPhoto, senderPhone, chatId, msgId, isImage } = remoteMessage.data;

    try {
      await this.createDefaultChannels();

      // 1. Resolve Identity
      const localContact = LocalDBService.getContactByUid(senderId);
      const displayTitle = localContact ? localContact.name : (senderPhone || 'New Message');

      // 2. For image messages — skip decryption, show emoji preview
      let finalMessage: string;
      if (isImage === 'true') {
        finalMessage = '📷 Photo';
      } else {
        // Decrypt text message
        const contactPubKey = await EncryptionService.getContactPublicKey(senderId);
        if (!contactPubKey) return;
        const sharedSecret = await EncryptionService.getSharedSecret(myUid, contactPubKey);
        if (!sharedSecret) return;
        const decryptedText = EncryptionService.decrypt({ cipherText, iv }, sharedSecret);
        finalMessage = decryptedText || 'New encrypted message';
      }

      // 3. Display notification (skip if user is actively in this chat)
      const isForeground = AppState.currentState === 'active';
      if (!(isForeground && MessageSyncService.activeChatId === chatId)) {
        await notifee.displayNotification({
          title: displayTitle,
          body: finalMessage,
          android: {
            channelId: 'messages_v3',
            importance: AndroidImportance.HIGH,
            largeIcon: senderPhoto || undefined,
            pressAction: { id: 'default', launchActivity: 'default' },
          },
          ios: { sound: 'default' },
          data: { type: 'chat', senderId, chatId },
        });
      }

      // 4. Update SQLite contact preview
      const newUnread = (localContact?.unreadCount || 0) + 1;
      LocalDBService.updateContactMetadata(senderId, finalMessage, newUnread, Date.now());

    } catch (error) {
      console.error('[NotificationService] Encrypted handler error:', error);
    }
  }

  async handleChatPress(data: any, notificationId?: string) {
    if (!data) return;

    if (notificationId) {
      await notifee.cancelNotification(notificationId);
    }

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

  // --- CALL HANDLERS ---
  async handleCallNotification(data: any) {
    const { receiverUid, senderName, senderId, callerPhoto, callType } = data;
    try {
      await notifee.displayNotification({
        id: 'incoming-call',
        title: callType === 'video' ? '📹 Incoming Video Call' : '🎤 Incoming Voice Call',
        body: `${senderName} is calling you...`,
        data: {
          type: 'call',
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
    const { callerId, receiverId, callerName, callerPhoto, callType } = data;
    await notifee.cancelNotification('incoming-call');
    // Navigate to the IncomingCallScreen so the user can accept/decline
    NavigationService.navigate('Screens', {
      screen: 'IncomingCallScreen',
      params: {
        callId: callerId < receiverId ? callerId + '_' + receiverId : receiverId + '_' + callerId,
        callerUid: callerId,
        callerName: callerName || 'Incoming Call',
        callerPhoto: callerPhoto || null,
        callType: callType || 'audio',
      },
    });
  }

  async handleDeclineCall(data: any) {
    if (!data) return;
    const { callerId, receiverId } = data;
    const deterministicID = callerId < receiverId ? callerId + receiverId : receiverId + callerId;
    await firestore().collection('calls').doc(deterministicID).update({ status: 'ended' });
    await notifee.cancelNotification('incoming-call');
  }

  // --- TOKEN MANAGEMENT ---
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
        id: 'messages_v3',
        name: 'Chat Messages',
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
    const authStatus = await messaging().requestPermission();
    return authStatus === messaging.AuthorizationStatus.AUTHORIZED || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  }

  async getFCMToken() {
    if (Platform.OS === 'ios' && !messaging().isDeviceRegisteredForRemoteMessages) {
      await messaging().registerDeviceForRemoteMessages();
    }
    return await messaging().getToken();
  }

  async updateFCMToken(userId: string) {
    if (!userId) return;
    await this.requestPermission();
    const token = await this.getFCMToken();
    if (token) await this.saveTokenToDatabase(userId, token);
  }
}

export default new NotificationService();


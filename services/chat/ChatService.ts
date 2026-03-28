import { database } from '../../firebase/config';
import { uploadToCloudinary } from '../media/CloudinaryService';
import axios from 'axios';
import { activeChatId } from '../../screens/Main/NoTabs/ChatScreen';
import LocalDBService from '../../localDB/LocalDBService';
import firestore from '@react-native-firebase/firestore';

// Replace with your network IP or Node.js server URL
// Use your computer's IP address instead of localhost for mobile devices
const NOTIFICATION_BRIDGE_URL = 'http://10.217.162.245:5221/send-notif'; // Replace with your actual IP

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  imageUrl?: string;
  type: 'text' | 'image' | 'text+image';
  status: 1 | 2 | 3; // 1: Sent, 2: Delivered, 3: Read
  timestamp: number;
}

export interface InboxItem {
  lastMessage: string;
  timestamp: number;
  unreadCount: number;
  otherUserName: string;
  otherUserPic: string;
  otherUid: string;
}

/**
 * Service to handle WhatsApp-style chat operations in RTDB.
 */
class ChatService {
  /**
   * Generates a common ID for two users by sorting their UIDs alphabetically.
   */
  getCommonId(uid1: string, uid2: string): string {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
  }

  /**
   * Sends a message to a user.
   */
  async sendMessage(
    senderId: string,
    receiverId: string,
    senderName: string,
    senderPic: string,
    receiverName: string,
    receiverPic: string,
    text: string,
    imageUri?: string
  ) {
    const commonId = this.getCommonId(senderId, receiverId);
    let imageUrl = '';
    let type: ChatMessage['type'] = 'text';

    // 1. Upload to Cloudinary if image exists
    if (imageUri) {
      const uploadedUrl = await uploadToCloudinary(imageUri);
      if (uploadedUrl) {
        imageUrl = uploadedUrl;
        type = text ? 'text+image' : 'image';
      }
    }

    const timestamp = Date.now();
    const messageRef = database().ref(`messages/${commonId}`).push();
    const messageId = messageRef.key!;

    const newMessage: ChatMessage = {
      id: messageId,
      senderId,
      receiverId,
      text,
      imageUrl: imageUrl || undefined,
      type,
      status: 1, // Sent
      timestamp,
    };

    // 2. Multi-path Atomic Update
    const updates: any = {};
    
    // Message itself
    updates[`messages/${commonId}/${messageId}`] = newMessage;

    // Sender's Inbox (unread: 0)
    updates[`inbox/${senderId}/${receiverId}`] = {
      lastMessage: text || 'Photo',
      timestamp,
      unreadCount: 0,
      otherUserName: receiverName,
      otherUserPic: receiverPic,
      otherUid: receiverId
    };

    // Receiver's Inbox (unread: increment +1)
    // NOTE: In a real production app, use transaction for unreadCount.
    // For simplicity, we'll fetch and increment here.
    const receiverInboxSnap = await database().ref(`inbox/${receiverId}/${senderId}/unreadCount`).once('value');
    const currentUnread = receiverInboxSnap.val() || 0;
    
    updates[`inbox/${receiverId}/${senderId}`] = {
      lastMessage: text || 'Photo',
      timestamp,
      unreadCount: currentUnread + 1,
      otherUserName: senderName,
      otherUserPic: senderPic,
      otherUid: senderId
    };

    try {
      await database().ref().update(updates);
      console.log('[ChatService] Message sent successfully.');

      // 3. Call Notification Bridge
      this.triggerNotification(receiverId, text || 'Sent you a photo', senderName, senderId, commonId);
      
      return true;
    } catch (error) {
      console.error('[ChatService] Error sending message:', error);
      return false;
    }
  }

  /**
   * Triggers a push notification via the Node.js bridge.
   */
  async triggerNotification(receiverId: string, message: string, senderName: string, senderId: string, chatId: string) {
    try {
      // Only call this if the receiver is NOT currently inside the same ChatScreen
      if (activeChatId === receiverId) {
        console.log('[ChatService] Receiver is in active chat. Skipping notification.');
        return;
      }

      await axios.post(NOTIFICATION_BRIDGE_URL, {
        receiverUid: receiverId, // Matching the Node.js code parameter names
        text: message,
        senderName,
        senderId,
        chatId,
      });
      console.log('[ChatService] Notification trigger sent.');
    } catch (error) {
      console.error('[ChatService] Error triggering notification:', error);
    }
  }

  /**
   * Triggers a call notification via Node.js bridge.
   */
  async triggerCallNotification(receiverId: string, senderName: string, senderId: string) {
    try {
      // First check if user is online and has FCM token using Firestore
      const userDoc = await firestore().collection('users').doc(receiverId).get();
      const userData = userDoc.data();
      
      if (!userData || !userData.fcmToken) {
        console.log('[ChatService] User offline or no FCM token');
        return;
      }

      await axios.post(NOTIFICATION_BRIDGE_URL, {
        receiverUid: receiverId,
        text: `Incoming Video Call from ${senderName}`,
        senderName,
        senderId,
        type: 'call', // Extra hint for backend/receiver
      });
      console.log('[ChatService] Call notification trigger sent.');
    } catch (error) {
      console.error('[ChatService] Error triggering call notification:', error);
    }
  }

  /**
   * Optimized real-time listener for messages using Child Event Listeners and Local Caching.
   */
  listenToMessages(commonId: string, currentUserId: string, onNewMessages: (messages: ChatMessage[]) => void) {
    // 1. Initial Load from Cache
    const cached = LocalDBService.getCachedMessages(commonId, 50);
    onNewMessages(cached as any);

    // 2. Get latest timestamp to start delta sync
    const lastTimestamp = LocalDBService.getLatestMessageTimestamp(commonId);

    // 3. Listen for NEW messages only
    const query = database()
      .ref(`messages/${commonId}`)
      .orderByChild('timestamp')
      .startAt(lastTimestamp + 1);

    const onChildAdded = query.on('child_added', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const newMessage: ChatMessage = {
        id: snapshot.key!,
        ...data,
      };

      // 4. Update status to 'Delivered' (2) if it was only 'Sent' (1) and we are the receiver
      if (newMessage.senderId !== currentUserId && newMessage.status === 1) {
        this.updateMessageStatus(commonId, newMessage.id, 2);
        newMessage.status = 2; // Update local object for immediate UI feedback
      }

      // 5. Save to Cache
      LocalDBService.saveMessage({
        id: newMessage.id,
        chatId: commonId,
        senderId: newMessage.senderId,
        text: newMessage.text,
        image: newMessage.imageUrl || null,
        timestamp: newMessage.timestamp,
        status: newMessage.status,
      });

      // 6. Trigger update with the single new message
      onNewMessages([newMessage]);
    });

    const onChildChanged = query.on('child_changed', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const updatedMsg: ChatMessage = {
        id: snapshot.key!,
        ...data,
      };

      // Save updated status to Cache
      LocalDBService.saveMessage({
        id: updatedMsg.id,
        chatId: commonId,
        senderId: updatedMsg.senderId,
        text: updatedMsg.text,
        image: updatedMsg.imageUrl || null,
        timestamp: updatedMsg.timestamp,
        status: updatedMsg.status,
      });

      // Trigger update
      onNewMessages([updatedMsg]);
    });

    return () => {
      query.off('child_added', onChildAdded);
      query.off('child_changed', onChildChanged);
    };
  }

  /**
   * Listens to the user's inbox (chat list).
   */
  listenToInbox(uid: string, callback: (inbox: InboxItem[]) => void) {
    const ref = database().ref(`inbox/${uid}`);
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const inbox: InboxItem[] = Object.values(data);
        callback(inbox.sort((a, b) => b.timestamp - a.timestamp));
      } else {
        callback([]);
      }
    });
    return () => ref.off('value');
  }

  /**
   * Updates message status (Sent -> Delivered -> Read).
   */
  async updateMessageStatus(commonId: string, messageId: string, status: 1 | 2 | 3) {
    try {
      await database().ref(`messages/${commonId}/${messageId}`).update({ status });
    } catch (error) {
      console.error('[ChatService] Error updating status:', error);
    }
  }

  /**
   * Resets unread count for a specific chat.
   */
  async resetUnreadCount(uid: string, otherUid: string) {
    try {
      await database().ref(`inbox/${uid}/${otherUid}`).update({ unreadCount: 0 });
    } catch (error) {
      console.error('[ChatService] Error resetting unread:', error);
    }
  }
}

export default new ChatService();

/**
 * CallNotificationService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends call push notifications via Node.js server (same pattern as chat push).
 * Route: POST http://YOUR_SERVER/send-call-notification
 * ─────────────────────────────────────────────────────────────────────────────
 */

import firestore from '@react-native-firebase/firestore';

// ── Same base URL as chat notifications ───────────────────────────────────────
// Update this to match your Node.js server IP/URL
const NOTIFICATION_SERVER_URL = 'http://10.71.90.27:5221';

export type CallNotificationType = 'incoming_call' | 'call_cancelled' | 'call_missed';

interface SendCallNotificationParams {
  receiverUid: string;
  callerUid: string;
  callerName: string;
  callerPhoto?: string | null;
  callId: string;
  callType: 'video' | 'audio';
  notificationType: CallNotificationType;
}

class CallNotificationService {
  /**
   * Send incoming call notification to receiver via Node.js server.
   * The server reads the receiver's FCM token from Firestore and sends
   * the push via Firebase Admin SDK — same pattern as chat messages.
   */
  async sendCallNotification(params: SendCallNotificationParams): Promise<void> {
    try {
      const response = await fetch(`${NOTIFICATION_SERVER_URL}/send-call-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverUid: params.receiverUid,
          callerUid: params.callerUid,
          callerName: params.callerName,
          callerPhoto: params.callerPhoto || null,
          callId: params.callId,
          callType: params.callType,   // 'video' | 'audio'
          type: 'call',                // Identifies this as a call (not chat)
          notificationType: params.notificationType,
        }),
      });

      if (!response.ok) {
        console.warn('[CallNotifService] Server responded with:', response.status);
      } else {
        console.log('[CallNotifService] Call notification sent successfully.');
      }
    } catch (error) {
      // If server is unreachable, call still works if receiver is online
      // (Firestore real-time listener in IncomingCallOverlay handles that)
      console.error('[CallNotifService] Failed to reach notification server:', error);
    }
  }

  /**
   * Send call cancelled notification (caller hung up before answer).
   */
  async sendCancellationNotification(
    receiverUid: string,
    callerUid: string,
    callerName: string,
    callId: string,
    callType: 'video' | 'audio',
  ): Promise<void> {
    await this.sendCallNotification({
      receiverUid,
      callerUid,
      callerName,
      callId,
      callType,
      notificationType: 'call_cancelled',
    });
  }

  /**
   * Retrieve receiver's FCM token from Firestore.
   * (Also used by Node.js server — kept here as utility)
   */
  async getReceiverFCMToken(receiverUid: string): Promise<string | null> {
    try {
      const doc = await firestore().collection('users').doc(receiverUid).get();
      return doc.data()?.userIdFCMtoken || null;
    } catch {
      return null;
    }
  }
}

export default new CallNotificationService();

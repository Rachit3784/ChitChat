/**
 * ChitChat Notification Bridge — Node.js (Express)
 *
 * Add this to your existing notification server (the one serving /send-notification).
 * This file shows ONLY the new endpoint for image notifications.
 *
 * Full server setup assumed:
 *   - express app already created
 *   - firebase-admin initialized with serviceAccountKey.json
 *   - FCM token fetched from Firestore users/{receiverId}.userIdFCMtoken
 */

const admin = require('firebase-admin'); // Already initialized in your server

// ── Helper: Get FCM token from Firestore ──────────────────────────────────────
async function getFCMToken(receiverId) {
  try {
    const doc = await admin.firestore().collection('users').doc(receiverId).get();
    return doc.data()?.userIdFCMtoken || null;
  } catch (err) {
    console.error('[Server] Failed to get FCM token:', err);
    return null;
  }
}

// ── NEW: Image Notification Endpoint ─────────────────────────────────────────
/**
 * POST /send-image-notification
 * Body: { receiverId, senderId, senderName, chatId, msgId }
 *
 * Sends a data-only FCM message that triggers handleEncryptedNotification
 * on the receiver. The body is "📷 Photo" — no image content in the push.
 */
app.post('/send-image-notification', async (req, res) => {
  const { receiverId, senderId, senderName, chatId, msgId } = req.body;

  if (!receiverId || !senderId || !chatId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const fcmToken = await getFCMToken(receiverId);
    if (!fcmToken) {
      console.log(`[Server] No FCM token for ${receiverId}, skipping.`);
      return res.status(200).json({ skipped: true, reason: 'no_token' });
    }

    const message = {
      token: fcmToken,
      // data-only payload (no notification block) — lets the app handle display
      data: {
        type: 'encrypted_chat',
        isImage: 'true',           // ← Key flag: receiver shows "📷 Photo"
        senderId: senderId,
        senderName: senderName || 'New Message',
        chatId: chatId,
        msgId: msgId || '',
        // No cipherText or iv — image content is never in push notifications
      },
      android: {
        priority: 'high',
        // TTL: 4 weeks (messages should be deliverable even if offline a while)
        ttl: 2419200 * 1000,
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'background',
        },
        payload: {
          aps: {
            'content-available': 1, // Silent push for iOS background processing
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`[Server] Image notification sent to ${receiverId}:`, response);
    return res.status(200).json({ success: true, fcmResponse: response });

  } catch (err) {
    console.error('[Server] Image notification error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── EXISTING: Text Notification Endpoint (for reference) ─────────────────────
/**
 * POST /send-notification
 * Body: { receiverId, senderId, senderName, cipherText, iv, chatId, msgId, type }
 *
 * Already implemented in your server — shown here for completeness.
 * The type field should be 'encrypted_chat' for text messages.
 */
// app.post('/send-notification', async (req, res) => { ... existing code ... });

module.exports = { getFCMToken };

# Firebase Cloud Messaging (FCM) Notification Setup Guide

This guide explains how to set up your Node.js backend to trigger video call notifications in the React Native app using Firebase Admin SDK.

## Prerequisites

1.  **Firebase Project**: Ensure you have a Firebase project set up.
2.  **Service Account Key**:
    - Go to the [Firebase Console](https://console.firebase.google.com/).
    - Project Settings > Service Accounts.
    - Click **Generate New Private Key**.
    - Save the JSON file as `service-account-file.json` in your backend project.

## Node.js Implementation

Install the Firebase Admin SDK:
```bash
npm install firebase-admin
```

### Sample Notification Script (`notify.js`)

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./service-account-file.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

/**
 * Trigger a Video Call Notification
 * @param {string} fcmToken - The target user's FCM token (stored in Firestore users collection)
 * @param {string} senderName - Name of the person calling
 * @param {string} senderId - UID of the caller
 * @param {string} receiverUid - UID of the receiver
 */
async function triggerVideoCall(fcmToken, senderName, senderId, receiverUid) {
  const message = {
    data: {
      type: 'call',
      senderName: senderName,
      senderId: senderId,
      receiverUid: receiverUid,
      text: 'Incoming Video Call',
    },
    token: fcmToken,
    android: {
      priority: 'high',
    },
    apns: {
      payload: {
        aps: {
          contentAvailable: true,
        },
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
  } catch (error) {
    console.log('Error sending message:', error);
  }
}

// Example usage:
// triggerVideoCall('USER_FCM_TOKEN', 'John Doe', 'caller_123', 'receiver_456');
```

## How it Works

1.  **Caller** initiates a call in the app.
2.  The app calls your Node.js API (or you can trigger it via a Cloud Function).
3.  The Node.js script sends a **Data Message** (not a Notification Message) to the receiver's FCM token.
4.  The React Native `NotificationService.ts` receives this data message.
5.  `notifee` displays a high-priority, persistent notification with **Accept** and **Decline** actions.
6.  Tapping **Accept** triggers the navigation to the `VideoCallScreen`.

## Important Notes

- **FCM Tokens**: Ensure your app saves the user's FCM token to Firestore during login/startup (the `NotificationService.ts` already has a `saveTokenToDatabase` method for this).
- **Background Handling**: On Android, `fullScreenAction: true` and `importance: HIGH` are required to show the call UI over the lock screen.
- **Node.js**: If you are using a custom Node.js server, you can use the script above in a POST route (e.g., `/trigger-call`).

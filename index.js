/**
 * @format
 */

// Polyfill for crypto.getRandomValues BEFORE any imports
if (typeof global.crypto !== 'object') {
  console.warn('[Polyfill] global.crypto missing, applying JS fallback...');
  global.crypto = {
    getRandomValues: (array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
  };
}

// Try to load the native module, but don't crash if it fails
try {
  require('react-native-get-random-values');
} catch (e) {
  console.warn('[Polyfill] react-native-get-random-values failed to load:', e.message);
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { handleNotificationLogic, convertToOngoingCall } from './services/calling/NotificationHandler';

import NotificationService, { handleBackgroundMessage } from './services/NotificationService';

// Unified Background Message Handler (Registered at the very top for reliability)
messaging().setBackgroundMessageHandler(handleBackgroundMessage);

/**
 * STANDALONE Notifee background event handler.
 * Must be registered at MODULE LEVEL (not inside a class/component) so it runs
 * in the headless JS context when the app is in background or killed state.
 */
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  if (!notification) return;

  const notifData = notification.data || {};
  // callId is stored as the notification id OR inside data.callId
  const callId = (notifData.callId) || notification.id;

  try {
    if (type === EventType.ACTION_PRESS) {
      if (pressAction?.id === 'accept') {
        // ── User pressed "Answer" from a background/killed-state notification ──
        // 1. Mark call accepted in Firestore so the caller navigates to ActiveCallScreen
        await firestore().collection('calls').doc(callId).update({ status: 'accepted' });
        // 2. Dismiss the ringing notification
        await notifee.cancelNotification(callId);
        // 3. Persist a navigation intent — App.tsx reads this when it comes to foreground
        await AsyncStorage.setItem('@pendingCallNav', JSON.stringify({
          callId,
          isCaller: false,
          timestamp: Date.now()
        }));

      } else if (pressAction?.id === 'reject' || pressAction?.id === 'decline') {
        // ── User pressed "Decline" ──
        await firestore().collection('calls').doc(callId).update({ status: 'declined' });
        await notifee.cancelNotification(callId);

      } else if (pressAction?.id === 'end_call') {
        // ── User pressed "End Call" on the ongoing-call notification ──
        await firestore().collection('calls').doc(callId).update({ status: 'ended' });
        await notifee.cancelNotification(callId);
        await notifee.stopForegroundService();

      } else if (pressAction?.id === 'end_outgoing_call') {
        // ── Caller pressed "End Call" on the outgoing-call notification (background) ──
        const outgoingCallId = notifData.callId || callId;
        await firestore().collection('calls').doc(outgoingCallId).update({ status: 'cancelled' });
        await notifee.cancelNotification(`outgoing_${outgoingCallId}`);
        await notifee.stopForegroundService();
      }

    } else if (type === EventType.PRESS) {
      // ── User tapped the notification body ──
      if (notifData.type === 'ongoing_call') {
        // Store navigation intent so App.tsx can redirect when it comes to foreground
        await AsyncStorage.setItem('@pendingCallNav', JSON.stringify({
          callId,
          isCaller: false,
          timestamp: Date.now()
        }));
      } else if (notifData.type === 'outgoing_call') {
        // Caller tapped the outgoing notification — restore OutgoingCallScreen
        await AsyncStorage.setItem('@pendingCallNav', JSON.stringify({
          callId: notifData.callId || callId,
          isCaller: true,
          type: 'outgoing',
          receiverName: notifData.receiverName || 'User',
          timestamp: Date.now()
        }));
      } else if (notifData.type === 'call_status' || notifData.type === 'missed_call') {
        // ── Declined / Not Available / Missed notification tapped — go to Calls tab ──
        await AsyncStorage.setItem('@pendingCallNav', JSON.stringify({
          type: 'calls_tab',
          timestamp: Date.now()
        }));
      }
    }
  } catch (e) {
    console.error('[notifee.onBackgroundEvent] Error:', e);
  }
});

AppRegistry.registerComponent(appName, () => App);

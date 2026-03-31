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
  // Now all notifications use the plain callId as their ID
  const callId = notifData.callId || notification.id;

  try {
    if (type === EventType.ACTION_PRESS) {
      if (pressAction?.id === 'accept') {
        // ── Receiver pressed "Answer" ──
        await firestore().collection('calls').doc(callId).update({ status: 'accepted' });
        // Start the ongoing call foreground service notification immediately
        await convertToOngoingCall(callId, notifData.callerName || 'User');
        await notifee.cancelNotification(callId);
        // Persist navigation intent for App.tsx to catch when it boots
        await AsyncStorage.setItem('@pendingCallNav', JSON.stringify({
          callId,
          isCaller: false,
          timestamp: Date.now()
        }));

      } else if (pressAction?.id === 'reject' || pressAction?.id === 'decline') {
        // ── Receiver pressed "Decline" ──
        await firestore().collection('calls').doc(callId).update({ status: 'declined' });
        await notifee.cancelNotification(callId);

      } else if (pressAction?.id === 'end_call') {
        // ── User pressed "End Call" on the ongoing-call notification ──
        await firestore().collection('calls').doc(callId).update({ status: 'ended' });
        await notifee.cancelNotification(callId);
        await notifee.stopForegroundService();

      } else if (pressAction?.id === 'end_outgoing_call') {
        // ── Caller pressed "End Call" on the outgoing-call notification (background) ──
        // With unified IDs, we just use callId
        await firestore().collection('calls').doc(callId).update({ status: 'cancelled' });
        await notifee.cancelNotification(callId);
        await notifee.stopForegroundService();
      }

    } else if (type === EventType.PRESS) {
      // ── User tapped the notification body ──
      const notifType = notifData.type;
      if (notifType === 'ongoing_call') {
        await AsyncStorage.setItem('@pendingCallNav', JSON.stringify({
          callId,
          isCaller: false,
          timestamp: Date.now()
        }));
      } else if (notifType === 'outgoing_call') {
        await AsyncStorage.setItem('@pendingCallNav', JSON.stringify({
          callId,
          isCaller: true,
          type: 'outgoing',
          receiverName: notifData.receiverName || 'User',
          timestamp: Date.now()
        }));
      } else if (notifType === 'call_status' || notifType === 'missed_call') {
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

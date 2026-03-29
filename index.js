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
import { handleNotificationLogic, convertToOngoingCall } from './services/calling/NotificationHandler';

// ... (previous code)

// Handle background events (Phase 4 & 6)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  if (!notification) return;

  if (type === EventType.ACTION_PRESS) {
    if (pressAction?.id === 'accept') {
      console.log('User accepted call from background');
      
      // 1. Update Firestore (Phase 4)
      await firestore().collection('calls').doc(notification.id).update({ status: 'accepted' });

      // 2. Convert to Ongoing Call Notification (Phase 4)
      await convertToOngoingCall(notification.id, notification.data?.callerName);
    }

    if (pressAction?.id === 'reject') {
      console.log('User rejected/declined call from background');
      await notifee.cancelNotification(notification.id);
      await firestore().collection('calls').doc(notification.id).update({ status: 'declined' });
    }
  }
});


AppRegistry.registerComponent(appName, () => App);


import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Linking, PermissionsAndroid, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FCM_TOKEN_CACHE_KEY = 'cached_fcm_token';

/**
 * Hook to synchronize Notification Permission and FCM Token with Firebase.
 * @param uid The current user's unique ID. Only syncs if uid is provided.
 */
export const useNotificationSync = (uid: string | null | undefined) => {
  const appState = useRef(AppState.currentState);

  const checkPermission = async () => {
    // 1. Android 13+ Runtime Permission Check
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const hasAndroidPermission = await PermissionsAndroid.check(
        'android.permission.POST_NOTIFICATIONS'
      );
      if (!hasAndroidPermission) {
        const status = await PermissionsAndroid.request(
          'android.permission.POST_NOTIFICATIONS'
        );
        if (status !== 'granted') return false;
      }
    }

    // 2. Firebase Cloud Messaging Permission Check
    const authStatus = await messaging().hasPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      return true;
    }

    // If not enabled, try requesting (only if not determined previously or first time)
    if (authStatus === messaging.AuthorizationStatus.NOT_DETERMINED) {
      const newAuthStatus = await messaging().requestPermission();
      return (
        newAuthStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        newAuthStatus === messaging.AuthorizationStatus.PROVISIONAL
      );
    }

    return false;
  };

  const clearTokenInFirebase = async () => {
    if (!uid) return;
    try {
      await firestore()
        .collection('users')
        .doc(uid)
        .update({
          userIdFCMtoken: null,
        });
      await AsyncStorage.removeItem(FCM_TOKEN_CACHE_KEY);
      console.log('[NotificationSync] Token cleared in Firestore (permission denied or revoked).');
    } catch (error) {
      console.error('[NotificationSync] Error clearing token:', error);
    }
  };

  const syncToken = async () => {
    if (!uid) return;

    try {
      const isGranted = await checkPermission();
      if (!isGranted) {
        console.log('[NotificationSync] Permission not granted/revoked. Ensuring token is cleared...');
        await clearTokenInFirebase();
        return;
      }

      // Get current token
      const currentToken = await messaging().getToken();
      if (!currentToken) {
        console.log('[NotificationSync] Failed to get FCM token.');
        return;
      }

      // Compare with cache
      const cachedToken = await AsyncStorage.getItem(FCM_TOKEN_CACHE_KEY);

      if (currentToken !== cachedToken) {
        console.log('[NotificationSync] Token changed or missing in cache. Updating Firestore...');
        
        // Update Firestore
        await firestore()
          .collection('users')
          .doc(uid)
          .update({
            userIdFCMtoken: currentToken,
          });

        // Update Cache
        await AsyncStorage.setItem(FCM_TOKEN_CACHE_KEY, currentToken);
        console.log('[NotificationSync] Token successfully synced and cached.');
      } else {
        console.log('[NotificationSync] Token is up to date.');
      }
    } catch (error) {
      console.error('[NotificationSync] Error during sync:', error);
    }
  };

  useEffect(() => {
    if (!uid) return;

    // 1. Initial sync (Cold Start)
    syncToken();

    // 2. Listen for token refresh
    const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
      console.log('[NotificationSync] Token refreshed mid-session.');
      if (uid) {
        const isGranted = await checkPermission();
        if (isGranted) {
          await firestore()
            .collection('users')
            .doc(uid)
            .update({
              userIdFCMtoken: newToken,
            });
          await AsyncStorage.setItem(FCM_TOKEN_CACHE_KEY, newToken);
        } else {
          await clearTokenInFirebase();
        }
      }
    });

    // 3. Listen for AppState changes (Warm Start)
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[NotificationSync] App returned to foreground. Re-checking sync...');
        await syncToken();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      unsubscribeTokenRefresh();
      subscription.remove();
    };
  }, [uid]);

  // Provide a safe check function for manual triggers or settings linking
  const requestPermissionAndSync = async () => {
    const isGranted = await checkPermission();
    if (isGranted) {
      await syncToken();
      return true;
    } else {
      // If denied, offer to open settings
      Linking.openSettings();
      return false;
    }
  };

  return {
    syncToken,
    requestPermissionAndSync,
  };
};

export default useNotificationSync;

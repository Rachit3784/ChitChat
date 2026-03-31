import React, { useEffect } from "react";
import { StatusBar, useColorScheme, AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import RootNavigator from "./navigation/RootNavigator";

import { NavigationContainer } from "@react-navigation/native";
import database from '@react-native-firebase/database';

database().setPersistenceEnabled(true);

import 'react-native-reanimated';
import { navigationRef } from "./services/NavigationService";
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { handleNotificationLogic, convertToOngoingCall } from './services/calling/NotificationHandler';
import CallManageService from './services/calling/CallManageService';
import userStore from './store/MyStore';

export default function App() {
  const isDark = useColorScheme() === "dark";
  const { userModelID } = userStore();

  useEffect(() => {
    if (userModelID) {
      // Global Busy Sync (Pro-Tip)
      CallManageService.syncBusyStateOnStart(userModelID);
      // Optional: Request battery optimization
      CallManageService.checkBatteryOptimization();
    }
  }, [userModelID]);

  // ── Kill-mode: Handle notification that opened the app from dead state ──────
  useEffect(() => {
    const handleInitialNotification = async () => {
      try {
        const initial = await notifee.getInitialNotification();
        if (!initial?.notification) return;

        const notif = initial.notification;
        const notifData = notif.data || {};
        const pressAction = initial.pressAction;
        const callId = (notifData.callId as string) || notif.id!;

        if (pressAction?.id === 'accept') {
          // ── Receiver opened app via "Answer" button from killed state ──
          await firestore().collection('calls').doc(callId).update({ status: 'accepted' });
          await notifee.cancelNotification(callId);
          setTimeout(() => {
            (navigationRef.current as any)?.navigate('Screens', {
              screen: 'ActiveCallScreen',
              params: { callId, isCaller: false },
            });
          }, 1500);

        } else if (pressAction?.id === 'reject' || pressAction?.id === 'decline') {
          await firestore().collection('calls').doc(callId).update({ status: 'declined' });
          await notifee.cancelNotification(callId);

        } else if ((notifData.type as string) === 'ongoing_call') {
          // ── App opened by tapping ongoing-call body ──
          // Verify the call is still active before navigating (prevents flash if call ended)
          setTimeout(async () => {
            try {
              const callDoc = await firestore().collection('calls').doc(callId).get();
              if (callDoc.data()?.status === 'accepted') {
                (navigationRef.current as any)?.navigate('Screens', {
                  screen: 'ActiveCallScreen',
                  params: { callId, isCaller: false },
                });
              } else {
                // Call already ended — cancel the stale notification
                await notifee.cancelNotification(callId);
                await notifee.stopForegroundService();
              }
            } catch (e) {
              console.warn('[App] ongoing_call restore check failed:', e);
            }
          }, 1500);

        } else if ((notifData.type as string) === 'outgoing_call') {
          // ── Caller re-opened app from outgoing-call notification (kill mode) ──
          const outgoingCallId = (notifData.callId as string) || callId;
          setTimeout(async () => {
            try {
              const callDoc = await firestore().collection('calls').doc(outgoingCallId).get();
              const callData = callDoc.data();
              const status = callData?.status;
              if (status === 'accepted') {
                // Call was accepted while app was killed, go straight to active call
                (navigationRef.current as any)?.navigate('Screens', {
                  screen: 'ActiveCallScreen',
                  params: { callId: outgoingCallId, isCaller: true },
                });
              } else if (status === 'ringing' || status === 'initiating') {
                // Call still ringing, restore the outgoing screen
                (navigationRef.current as any)?.navigate('Screens', {
                  screen: 'OutgoingCallScreen',
                  params: {
                    callId: outgoingCallId,
                    receiverId: callData?.receiverId,
                    receiverName: callData?.receiverName || (notifData.receiverName as string) || 'User',
                    receiverPhoto: callData?.receiverPhoto || null,
                    callType: callData?.type || 'audio',
                  },
                });
              }
              // else call ended — do nothing, status notification already showed
            } catch (e) {
              console.warn('[App] Outgoing call restore failed:', e);
            }
          }, 1500);
        }
      } catch (e) {
        console.warn('[App] Initial notification check failed:', e);
      }
    };
    handleInitialNotification();
  }, []);

  // ── Background → Foreground: Navigate to active/outgoing call if user came from notification ─
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === 'active') {
        try {
          const raw = await AsyncStorage.getItem('@pendingCallNav');
          if (!raw) return;
          const { callId, isCaller, type: navType, receiverName, timestamp } = JSON.parse(raw);
          await AsyncStorage.removeItem('@pendingCallNav');

          // Only act if the stored intent is recent (< 3 minutes)
          if (Date.now() - timestamp > 180000) return;

          const callDoc = await firestore().collection('calls').doc(callId).get();
          const callData = callDoc.data();
          const status = callData?.status;

          if (navType === 'outgoing') {
            // Restore outgoing call screen or go to active call
            if (status === 'accepted') {
              (navigationRef.current as any)?.navigate('Screens', {
                screen: 'ActiveCallScreen',
                params: { callId, isCaller: true },
              });
            } else if (status === 'ringing' || status === 'initiating') {
              (navigationRef.current as any)?.navigate('Screens', {
                screen: 'OutgoingCallScreen',
                params: {
                  callId,
                  receiverId: callData?.receiverId,
                  receiverName: callData?.receiverName || receiverName || 'User',
                  receiverPhoto: callData?.receiverPhoto || null,
                  callType: callData?.type || 'audio',
                },
              });
            }
          } else if (status === 'accepted') {
            // Restore incoming active call
            (navigationRef.current as any)?.navigate('Screens', {
              screen: 'ActiveCallScreen',
              params: { callId, isCaller },
            });
          }
        } catch (e) {
          console.warn('[App] Pending call nav check failed:', e);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // ── Foreground FCM + Notifee event listeners ─────────────────────────────────
  useEffect(() => {
    // 1. FCM Foreground listener (INCOMING_CALL only — chat is handled by NotificationService)
    const unsubscribeMessaging = messaging().onMessage(async (remoteMessage) => {
      console.log('Foreground FCM:', remoteMessage);
      if (remoteMessage.data?.type === 'INCOMING_CALL') {
        await handleNotificationLogic(remoteMessage);
      }
    });

    // 2. Notifee Foreground listener (Handles notification clicks while app is open)
    const unsubscribeNotifee = notifee.onForegroundEvent(async ({ type, detail }) => {
      const { notification, pressAction } = detail;
      if (!notification) return;

      if (type === EventType.ACTION_PRESS) {
        if (pressAction?.id === 'accept') {
          console.log('User accepted call from foreground notification');
          // Phase 4: Sync status and convert to ongoing
          await firestore().collection('calls').doc(notification.id).update({ status: 'accepted' });
          await convertToOngoingCall(notification.id, notification.data?.callerName);

          (navigationRef.current as any)?.navigate('Screens', {
            screen: 'ActiveCallScreen',
            params: { callId: notification.id, isCaller: false }
          });
        } else if (pressAction?.id === 'reject') {
          await firestore().collection('calls').doc(notification.id!).update({ status: 'declined' });
          await notifee.cancelNotification(notification.id!);
        } else if (pressAction?.id === 'end_call') {
          await firestore().collection('calls').doc(notification.id!).update({ status: 'ended' });
          await notifee.cancelNotification(notification.id!);
          await notifee.stopForegroundService();
        } else if (pressAction?.id === 'end_outgoing_call') {
          // ── Caller taps "End Call" on outgoing notification while app is in foreground ──
          const outCallId = (notification.data?.callId as string) || notification.id!;
          await firestore().collection('calls').doc(outCallId).update({ status: 'cancelled' });
          await notifee.cancelNotification(`outgoing_${outCallId}`);
          await notifee.stopForegroundService();
        }
      } else if (type === EventType.PRESS) {
        const notifType = notification.data?.type as string;
        if (notifType === 'ongoing_call') {
          (navigationRef.current as any)?.navigate('Screens', {
            screen: 'ActiveCallScreen',
            params: { callId: notification.id, isCaller: false },
          });
        } else if (notifType === 'outgoing_call') {
          // ── Caller tapped the outgoing notification while app is in foreground ──
          const outCallId = (notification.data?.callId as string) || notification.id!;
          (navigationRef.current as any)?.navigate('Screens', {
            screen: 'OutgoingCallScreen',
            params: {
              callId: outCallId,
              receiverName: notification.data?.receiverName as string || 'User',
            },
          });
        } else if (notifType === 'call_status') {
          // ── Declined / Not Available notification tapped — go to Call History ──
          (navigationRef.current as any)?.navigate('Main', {
            screen: 'Calls',
          });
        } else if (notifType === 'missed_call') {
          // ── Missed call notification tapped — go to Call History ──
          (navigationRef.current as any)?.navigate('Main', {
            screen: 'Calls',
          });
        } else {
          // Incoming call notification body tap — show incoming screen
          (navigationRef.current as any)?.navigate('Screens', {
            screen: 'IncomingCallScreen',
            params: {
              callId: notification.id,
              callerName: notification.data?.callerName,
            },
          });
        }
      }
    });

    return () => {
      unsubscribeMessaging();
      unsubscribeNotifee();
    };
  }, []);



  return (

    <SafeAreaProvider>

      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
      </NavigationContainer>

    </SafeAreaProvider>

  );
}

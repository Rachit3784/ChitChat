import React, { useEffect } from "react";
import { StatusBar, useColorScheme } from "react-native";
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

  useEffect(() => {
    // 1. FCM Foreground listener
    const unsubscribeMessaging = messaging().onMessage(async (remoteMessage) => {
      console.log('Foreground FCM:', remoteMessage);
      await handleNotificationLogic(remoteMessage);
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
        }
      } else if (type === EventType.PRESS) {
        if (notification.data?.type === 'ongoing_call') {
          (navigationRef.current as any)?.navigate('Screens', { 
            screen: 'ActiveCallScreen', 
            params: { callId: notification.id, isCaller: false } 
          });
        } else {
          // User tapped the notification body, just show the incoming screen
          (navigationRef.current as any)?.navigate('Screens', { 
            screen: 'IncomingCallScreen',
            params: { 
              callId: notification.id, 
              callerName: notification.data?.callerName 
            }
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
        <RootNavigator/>
      </NavigationContainer>

    </SafeAreaProvider>
    
  );
}

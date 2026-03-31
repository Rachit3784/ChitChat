import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import notifee from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PhoneOff } from 'lucide-react-native';
import CallManageService from '../../services/calling/CallManageService';
import CallLogService from '../../services/calling/CallLogService';
import {
  displayOutgoingCall,
  showCallStatusNotification,
  convertOutgoingToOngoing,
} from '../../services/calling/NotificationHandler';

const { width } = Dimensions.get('window');

const OutgoingCallScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const { callId, receiverId, receiverName, receiverPhoto, callType } = route.params;
  const [callStatus, setCallStatus] = useState('Calling...');

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const setup = async () => {
      // ── PRE-CHECK: Verify call is still active before creating the notification ──
      // This handles the case where the user taps a stale outgoing notification
      // after the call was already accepted — we go straight to ActiveCallScreen.
      try {
        const callSnap = await firestore().collection('calls').doc(callId).get();
        const currentStatus = callSnap.data()?.status;

        if (currentStatus === 'accepted') {
          // Call already accepted (e.g. user re-tapped outgoing notif) — go directly
          navigation.replace('Screens', {
            screen: 'ActiveCallScreen',
            params: { callId, isCaller: true },
          });
          return;
        } else if (['declined', 'cancelled', 'missed', 'user_unavailable', 'failed', 'ended']
            .includes(currentStatus || '')) {
          // Call already in terminal state — navigate back
          CallManageService.isBusy = false;
          navigation.canGoBack()
            ? navigation.goBack()
            : navigation.navigate('Main', { screen: 'Home' });
          return;
        }
      } catch (e) {
        console.warn('[OutgoingCallScreen] Pre-check failed:', e);
      }

      // ── STEP 1: Create notification FIRST, THEN watch Firestore ─────────────────
      // Awaiting ensures the notification exists before any cancel logic runs.
      await displayOutgoingCall(callId, receiverName, receiverPhoto);

      // ── STEP 2: Attach Firestore listener ─────────────────────────────────
      unsubscribe = firestore()
        .collection('calls')
        .doc(callId)
        .onSnapshot(async doc => {
          const data = doc.data();
          if (!doc.exists || !data) return;

          if (data.status === 'ringing') {
            setCallStatus('Ringing...');

          } else if (data.status === 'accepted') {
            setCallStatus('Connecting...');
            try {
              // Convert outgoing → ongoing notification for the caller
              await convertOutgoingToOngoing(callId, receiverName);
            } catch (convErr) {
              console.error('[OutgoingCallScreen] convertOutgoingToOngoing error:', convErr);
              // Fallback: manually cancel the outgoing notification so it doesn't stay stuck
              await notifee.cancelNotification(`outgoing_${callId}`).catch(() => {});
              await notifee.stopForegroundService().catch(() => {});
            }
            // Always store pending nav + navigate, even if notification conversion failed
            await AsyncStorage.setItem('@pendingCallNav', JSON.stringify({
              callId,
              isCaller: true,
              timestamp: Date.now(),
            }));
            navigation.replace('Screens', {
              screen: 'ActiveCallScreen',
              params: { callId, isCaller: true },
            });

          } else if (data.status === 'declined') {
            CallManageService.isBusy = false;
            await notifee.cancelNotification(`outgoing_${callId}`);
            await notifee.stopForegroundService();
            await showCallStatusNotification(callId, 'declined', receiverName);
            CallLogService.saveCallLog({
              id: callId,
              contactUid: receiverId,
              contactName: receiverName || 'User',
              contactPhoto: receiverPhoto || null,
              callType: callType || 'audio',
              direction: 'outgoing',
              status: 'declined',
              startedAt: Date.now(),
              duration: 0,
            });
            navigation.canGoBack()
              ? navigation.goBack()
              : navigation.navigate('Main', { screen: 'Home' });

          } else if (['user_unavailable', 'failed'].includes(data.status)) {
            CallManageService.isBusy = false;
            await notifee.cancelNotification(`outgoing_${callId}`);
            await notifee.stopForegroundService();
            await showCallStatusNotification(callId, 'unavailable', receiverName);
            CallLogService.saveCallLog({
              id: callId,
              contactUid: receiverId,
              contactName: receiverName || 'User',
              contactPhoto: receiverPhoto || null,
              callType: callType || 'audio',
              direction: 'outgoing',
              status: 'missed',
              startedAt: Date.now(),
              duration: 0,
            });
            navigation.canGoBack()
              ? navigation.goBack()
              : navigation.navigate('Main', { screen: 'Home' });

          } else if (['cancelled', 'missed'].includes(data.status)) {
            CallManageService.isBusy = false;
            await notifee.cancelNotification(`outgoing_${callId}`);
            await notifee.stopForegroundService();
            navigation.canGoBack()
              ? navigation.goBack()
              : navigation.navigate('Main', { screen: 'Home' });
          }
        });

      // 45s Timeout fallback — auto-mark missed if no answer
      timeoutId = setTimeout(async () => {
        await notifee.cancelNotification(`outgoing_${callId}`);
        await notifee.stopForegroundService();
        CallLogService.saveCallLog({
          id: callId,
          contactUid: receiverId,
          contactName: receiverName || 'User',
          contactPhoto: receiverPhoto || null,
          callType: callType || 'audio',
          direction: 'outgoing',
          status: 'missed',
          startedAt: Date.now(),
          duration: 0,
        });
        firestore().collection('calls').doc(callId).update({ status: 'missed' });
      }, 45000);
    };

    setup();

    return () => {
      if (unsubscribe) unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
      // Safety: cancel notification if screen unmounts unexpectedly
      notifee.cancelNotification(`outgoing_${callId}`).catch(() => {});
    };
  }, [callId]);

  const endCall = async () => {
    try {
      CallManageService.isBusy = false;
      // 1. Cancel outgoing notification & stop foreground service
      await notifee.cancelNotification(`outgoing_${callId}`);
      // 2. Signal cancellation to receiver via backend
      if (callId && receiverId) {
        await CallManageService.cancelCall(callId, receiverId);
      }
      // 3. Local log
      CallLogService.saveCallLog({
        id: callId,
        contactUid: receiverId,
        contactName: receiverName || 'User',
        contactPhoto: receiverPhoto || null,
        callType: callType || 'audio',
        direction: 'outgoing',
        status: 'declined',
        startedAt: Date.now(),
        duration: 0,
      });
      // 4. Update Firestore
      await firestore().collection('calls').doc(callId).update({ status: 'cancelled' });
      navigation.canGoBack()
        ? navigation.goBack()
        : navigation.navigate('Main', { screen: 'Home' });
    } catch (e) {
      console.error('End Call Error:', e);
      CallManageService.isBusy = false;
      notifee.cancelNotification(`outgoing_${callId}`).catch(() => {});
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoContainer}>
        {receiverPhoto ? (
          <Image source={{ uri: receiverPhoto }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.placeholderAvatar]}>
            <Text style={styles.avatarText}>{receiverName?.charAt(0) || 'U'}</Text>
          </View>
        )}
        <Text style={styles.name}>{receiverName || 'User'}</Text>
        <Text style={styles.status}>{callStatus}</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.endButton} onPress={endCall}>
          <PhoneOff color="#fff" size={32} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  infoContainer: { alignItems: 'center' },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 20 },
  placeholderAvatar: {
    backgroundColor: '#3a3a3c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  name: { color: '#fff', fontSize: 28, fontWeight: '600', marginBottom: 10 },
  status: { color: '#8e8e93', fontSize: 18 },
  controls: { width: '100%', alignItems: 'center' },
  endButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
});

export default OutgoingCallScreen;
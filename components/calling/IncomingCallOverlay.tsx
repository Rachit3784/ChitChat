/**
 * IncomingCallOverlay.tsx
 * Global overlay mounted at RootNavigator level.
 * Listens to Firestore in real-time for incoming calls addressed to this user.
 * Works whether the user is on HomeScreen, ChatScreen, or any other screen.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Vibration,
  Easing,
  Platform,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { Phone, PhoneOff } from 'lucide-react-native';
import NavigationService from '../../services/NavigationService';
import userStore from '../../store/MyStore';
import CallService from '../../services/calling/CallService';
import CallLogService from '../../services/calling/CallLogService';
import notifee from '@notifee/react-native';

interface IncomingCallData {
  callId: string;
  callerUid: string;
  callerName: string;
  callerPhoto: string | null;
  callType: 'video' | 'audio';
}

const IncomingCallOverlay = () => {
  const { userModelID } = userStore();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideIn = useRef(new Animated.Value(-200)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const firestoreUnsub = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!userModelID) return;

    firestoreUnsub.current = firestore()
      .collection('calls')
      .where('receiverUid', '==', userModelID)
      .where('status', '==', 'ringing')
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            // Guard: only show calls from last 2 minutes
            const isRecent = Date.now() - (data.startedAt || 0) < 120000;
            if (!isRecent) return;

            showIncomingCall({
              callId: change.doc.id,
              callerUid: data.callerUid,
              callerName: data.callerName,
              callerPhoto: data.callerPhoto || null,
              callType: data.type || 'audio',
            });
          }

          if (change.type === 'modified') {
            const data = change.doc.data();
            if (data.status === 'ended' || data.status === 'declined') {
              dismissOverlay(change.doc.id);
            }
          }

          if (change.type === 'removed') {
            setIncomingCall((current) => {
              if (current?.callId === change.doc.id) {
                dismissOverlay(change.doc.id);
                return null;
              }
              return current;
            });
          }
        });
      });

    return () => {
      firestoreUnsub.current?.();
    };
  }, [userModelID]);

  const showIncomingCall = (callData: IncomingCallData) => {
    // Don't show if already in a call or this call is already shown
    if (CallService.isInCall()) return;
    if (incomingCall?.callId === callData.callId) return;

    setIncomingCall(callData);

    // Dismiss any existing call notification (app was already open)
    notifee.cancelNotification('incoming-call').catch(() => {});

    // Slide in animation
    Animated.spring(slideIn, {
      toValue: 0,
      useNativeDriver: true,
      tension: 70,
      friction: 9,
    }).start();

    // Pulse
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.current.start();

    // Vibrate
    Vibration.vibrate([0, 600, 400, 600, 400, 600], true);

    // Auto-dismiss after 60s (missed)
    setTimeout(() => {
      setIncomingCall((current) => {
        if (current?.callId === callData.callId) {
          Vibration.cancel();
          CallLogService.saveCallLog({
            id: callData.callId,
            contactUid: callData.callerUid,
            contactName: callData.callerName,
            contactPhoto: callData.callerPhoto,
            callType: callData.callType,
            direction: 'incoming',
            status: 'missed',
            startedAt: Date.now(),
            duration: 0,
          });
          return null;
        }
        return current;
      });
    }, 60000);
  };

  const dismissOverlay = (callId: string) => {
    setIncomingCall((current) => {
      if (current?.callId === callId) {
        pulseLoop.current?.stop();
        Vibration.cancel();
        // Animate out
        Animated.timing(slideIn, {
          toValue: -200,
          duration: 250,
          useNativeDriver: true,
        }).start();
        return null;
      }
      return current;
    });
  };

  const handleAccept = () => {
    if (!incomingCall || !userModelID) return;
    const call = incomingCall;
    pulseLoop.current?.stop();
    Vibration.cancel();
    setIncomingCall(null);

    NavigationService.navigate('Screens', {
      screen: 'IncomingCallScreen',
      params: {
        callId: call.callId,
        callerUid: call.callerUid,
        callerName: call.callerName,
        callerPhoto: call.callerPhoto,
        callType: call.callType,
      },
    });
  };

  const handleDecline = async () => {
    if (!incomingCall) return;
    const call = incomingCall;
    pulseLoop.current?.stop();
    Vibration.cancel();
    setIncomingCall(null);

    CallLogService.saveCallLog({
      id: call.callId,
      contactUid: call.callerUid,
      contactName: call.callerName,
      contactPhoto: call.callerPhoto,
      callType: call.callType,
      direction: 'incoming',
      status: 'declined',
      startedAt: Date.now(),
      duration: 0,
    });

    await CallService.declineCall(call.callId);
  };

  if (!incomingCall) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideIn }] }]}>
      {/* Left: Avatar + Info */}
      <View style={styles.leftSection}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          {incomingCall.callerPhoto ? (
            <Image source={{ uri: incomingCall.callerPhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {incomingCall.callerName?.charAt(0)?.toUpperCase()}
              </Text>
            </View>
          )}
        </Animated.View>

        <View style={styles.callInfo}>
          <Text style={styles.callerName} numberOfLines={1}>
            {incomingCall.callerName}
          </Text>
          <Text style={styles.callTypeLabel}>
            {incomingCall.callType === 'video' ? '📹 Video Call' : '🎤 Voice Call'}
          </Text>
        </View>
      </View>

      {/* Right: Accept + Decline */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
          <PhoneOff size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
          <Phone size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 0 : 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: '#1a237e',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 36 : 50,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1565c0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  callInfo: { flex: 1 },
  callerName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  callTypeLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  declineBtn: {
    backgroundColor: '#e53935',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    backgroundColor: '#2e7d32',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default IncomingCallOverlay;

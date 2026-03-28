/**
 * IncomingCallScreen.tsx
 * Full-screen incoming call UI — shown when app is open or from notification
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  StatusBar,
  Platform,
  Vibration,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Phone, PhoneOff } from 'lucide-react-native';
import CallService from '../../services/calling/CallService';
import CallLogService from '../../services/calling/CallLogService';
import userStore from '../../store/MyStore';

const IncomingCallScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { callId, callerUid, callerName, callerPhoto, callType } = route.params;
  const { userModelID, userName, userData } = userStore();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideUp = useRef(new Animated.Value(100)).current;
  const btnFadeAccept = useRef(new Animated.Value(0)).current;
  const btnFadeDecline = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse avatar ring
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    // Slide up buttons
    Animated.spring(slideUp, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();

    Animated.parallel([
      Animated.timing(btnFadeAccept, { toValue: 1, duration: 400, useNativeDriver: true, delay: 300 }),
      Animated.timing(btnFadeDecline, { toValue: 1, duration: 400, useNativeDriver: true, delay: 500 }),
    ]).start();

    // Vibrate (ringtone feel)
    const vibratePattern = [0, 500, 300, 500, 300, 500];
    Vibration.vibrate(vibratePattern, true);

    // Listen for caller cancellation
    const unsub = CallService.listenForIncomingCalls(
      userModelID!,
      () => { }, // already on the screen
      (cancelledCallId) => {
        if (cancelledCallId === callId) {
          Vibration.cancel();
          CallLogService.saveCallLog({
            id: callId,
            contactUid: callerUid,
            contactName: callerName,
            contactPhoto: callerPhoto || null,
            callType: callType || 'audio',
            direction: 'incoming',
            status: 'missed',
            startedAt: Date.now(),
            duration: 0,
          });
          navigation.goBack();
        }
      },
    );

    return () => {
      pulse.stop();
      Vibration.cancel();
      unsub();
    };
  }, []);

  const handleAccept = async () => {
    Vibration.cancel();
    if (!userModelID) return;

    try {
      await CallService.acceptCall(
        callId,
        userModelID,
        userName || userData?.name || 'Unknown',
        userData?.photo,
        callerUid,
        callerName,
        callerPhoto,
        callType || 'audio',
      );

      CallService.setCallbacks({
        onCallEnded: ({ duration, reason }) => {
          CallLogService.saveCallLog({
            id: callId,
            contactUid: callerUid,
            contactName: callerName,
            contactPhoto: callerPhoto || null,
            callType: callType || 'audio',
            direction: 'incoming',
            status: duration > 0 ? 'completed' : 'missed',
            startedAt: Date.now() - duration * 1000,
            duration,
          });
        },
      });

      navigation.replace('ActiveCallScreen', {
        callId,
        callType: callType || 'audio',
        contactUid: callerUid,
        contactName: callerName,
        contactPhoto: callerPhoto,
        isIncoming: true,
      });
    } catch (err) {
      console.error('[IncomingCallScreen] Accept error:', err);
      navigation.goBack();
    }
  };

  const handleDecline = async () => {
    Vibration.cancel();
    CallLogService.saveCallLog({
      id: callId,
      contactUid: callerUid,
      contactName: callerName,
      contactPhoto: callerPhoto || null,
      callType: callType || 'audio',
      direction: 'incoming',
      status: 'declined',
      startedAt: Date.now(),
      duration: 0,
    });
    await CallService.declineCall(callId);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <LinearGradient
        colors={['#0A3D62', '#1B2838', '#0D1B2A']}
        style={StyleSheet.absoluteFill}
      />

      {/* Call type badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>
          {callType === 'video' ? '📹 Incoming Video Call' : '🎤 Incoming Voice Call'}
        </Text>
      </View>

      {/* Avatar */}
      <View style={styles.avatarArea}>
        <Animated.View
          style={[styles.pulseRing, styles.pulseRing3, { transform: [{ scale: pulseAnim }] }]}
        />
        <Animated.View
          style={[styles.pulseRing, styles.pulseRing2, { transform: [{ scale: pulseAnim }] }]}
        />
        <Animated.View
          style={[styles.pulseRing, styles.pulseRing1, { transform: [{ scale: pulseAnim }] }]}
        />

        {callerPhoto ? (
          <Image source={{ uri: callerPhoto }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{callerName?.charAt(0)?.toUpperCase()}</Text>
          </View>
        )}
      </View>

      <Text style={styles.callerName}>{callerName}</Text>
      <Text style={styles.ringingText}>Ringing...</Text>

      {/* Action Buttons */}
      <Animated.View style={[styles.actionsContainer, { transform: [{ translateY: slideUp }] }]}>
        <Animated.View style={{ opacity: btnFadeDecline }}>
          <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={handleDecline}>
            <PhoneOff size={30} color="#fff" />
            <Text style={styles.actionLabel}>Decline</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ opacity: btnFadeAccept }}>
          <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={handleAccept}>
            <Phone size={30} color="#fff" />
            <Text style={styles.actionLabel}>Accept</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  badge: {
    marginTop: Platform.OS === 'android' ? 54 : 64,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 24,
  },
  badgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarArea: {
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pulseRing1: {
    width: 130,
    height: 130,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  pulseRing2: {
    width: 162,
    height: 162,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pulseRing3: {
    width: 194,
    height: 194,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  avatar: {
    width: 114,
    height: 114,
    borderRadius: 57,
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: '#1565c0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarInitial: { color: '#fff', fontSize: 44, fontWeight: 'bold' },
  callerName: {
    marginTop: 24,
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ringingText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
  actionsContainer: {
    position: 'absolute',
    bottom: 80,
    flexDirection: 'row',
    gap: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtn: {
    alignItems: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    elevation: 10,
  },
  declineBtn: {
    backgroundColor: '#e53935',
    shadowColor: '#e53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  acceptBtn: {
    backgroundColor: '#2e7d32',
    shadowColor: '#2e7d32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
});

export default IncomingCallScreen;

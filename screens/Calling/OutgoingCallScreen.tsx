/**
 * OutgoingCallScreen.tsx
 * Full-screen outgoing call UI — caller side
 */
import React, { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  PhoneOff,
  MicOff,
  Mic,
  Volume2,
  Video,
  VideoOff,
} from 'lucide-react-native';
import CallService from '../../services/calling/CallService';
import CallNotificationService from '../../services/calling/CallNotificationService';
import CallLogService from '../../services/calling/CallLogService';
import userStore from '../../store/MyStore';

const OutgoingCallScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { contactUid, contactName, contactPhoto, callType } = route.params;
  const { userModelID, userName, userData } = userStore();

  const [callState, setCallState] = useState<string>('Calling...');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [timerText, setTimerText] = useState('');

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<any>(null);
  const callIdRef = useRef<string | null>(null);
  const isHangingUp = useRef(false); // guard double-hangup

  // Pulse animation for the avatar while ringing
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Start call
  useEffect(() => {
    const initCall = async () => {
      if (!userModelID) return;
      try {
        CallService.setCallbacks({
          onStateChange: (state) => {
            if (isHangingUp.current) return; // Don't react after we already hung up
            if (state === 'connected') {
              setCallState('Connected');
              const now = Date.now();
              setStartTime(now);
              timerRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - now) / 1000);
                const m = Math.floor(elapsed / 60);
                const s = elapsed % 60;
                setTimerText(`${m}:${s.toString().padStart(2, '0')}`);
              }, 1000);
              // Navigate to active call screen
              navigation.replace('ActiveCallScreen', {
                callId: callIdRef.current,
                callType,
                contactUid,
                contactName,
                contactPhoto,
                isIncoming: false,
              });
            } else if (state === 'declined') {
              clearInterval(timerRef.current);
              CallLogService.saveCallLog({
                id: callIdRef.current!,
                contactUid, contactName,
                contactPhoto: contactPhoto || null,
                callType, direction: 'outgoing', status: 'declined',
                startedAt: Date.now(), duration: 0,
              });
              setCallState('Call Declined');
              setTimeout(() => navigation.goBack(), 1500);
            } else if (state === 'ended') {
              clearInterval(timerRef.current);
              if (!isHangingUp.current) navigation.goBack();
            }
          },
          onLocalStream: () => {},
          onRemoteStream: () => {},
          onCallEnded: ({ duration }) => {
            clearInterval(timerRef.current);
          },
        });

        const id = await CallService.startCall(
          userModelID,
          userName || userData?.name || 'Unknown',
          userData?.photo,
          contactUid,
          contactName,
          contactPhoto,
          callType,
        );
        callIdRef.current = id;
        setCallId(id);

        // Send push notification to receiver via Node.js
        await CallNotificationService.sendCallNotification({
          receiverUid: contactUid,
          callerUid: userModelID,
          callerName: userName || userData?.name || 'Unknown',
          callerPhoto: userData?.photo,
          callId: id,
          callType,
          notificationType: 'incoming_call',
        });
      } catch (err: any) {
        console.error('[OutgoingCallScreen] initCall error:', err);
        setCallState(err?.message || 'Failed to start call');
        setTimeout(() => navigation.goBack(), 2000);
      }
    };

    initCall();

    return () => {
      clearInterval(timerRef.current);
    };
  }, []);

  const handleHangUp = async () => {
    if (isHangingUp.current) return; // prevent double-tap
    isHangingUp.current = true;
    clearInterval(timerRef.current);

    // Step 1: Update Firestore to 'ended' FIRST.
    // This immediately triggers the receiver's Firestore listener and dismisses
    // their IncomingCallScreen / notification overlay.
    await CallService.endCall('cancelled');

    // Step 2: Save our own call log.
    if (callIdRef.current) {
      CallLogService.saveCallLog({
        id: callIdRef.current,
        contactUid, contactName,
        contactPhoto: contactPhoto || null,
        callType, direction: 'outgoing',
        status: 'missed',   // Receiver never picked up
        startedAt: startTime || Date.now(),
        duration: 0,
      });

      // Step 3: Belt-and-suspenders — send FCM cancellation to dismiss any
      // system notification on background/killed device. Fire-and-forget.
      CallNotificationService.sendCancellationNotification(
        contactUid,
        userModelID!,
        userName || userData?.name || 'Unknown',
        callIdRef.current,
        callType,
      ).catch(() => {}); // Don't block navigation on network error
    }

    navigation.goBack();
  };

  const handleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    CallService.setMuted(next);
  };

  const handleVideoToggle = () => {
    const next = !isVideoOff;
    setIsVideoOff(next);
    CallService.setVideoEnabled(!next);
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <LinearGradient
        colors={['#0D1B2A', '#1B2838', '#0A3D62']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.callTypeLabel}>
          {callType === 'video' ? '📹 Video Call' : '🎤 Voice Call'}
        </Text>
      </View>

      {/* Avatar Area */}
      <View style={styles.avatarArea}>
        {/* Pulse rings */}
        <Animated.View
          style={[styles.pulseRing, styles.pulseRing3, { transform: [{ scale: pulseAnim }] }]}
        />
        <Animated.View
          style={[styles.pulseRing, styles.pulseRing2, { transform: [{ scale: pulseAnim }] }]}
        />
        <Animated.View
          style={[styles.pulseRing, styles.pulseRing1, { transform: [{ scale: pulseAnim }] }]}
        />

        {contactPhoto ? (
          <Image source={{ uri: contactPhoto }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{contactName?.charAt(0)?.toUpperCase()}</Text>
          </View>
        )}
      </View>

      <Text style={styles.contactName}>{contactName}</Text>
      <Text style={styles.callStatus}>{timerText || callState}</Text>

      {/* Controls */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.controlBtn} onPress={handleMute}>
          {isMuted ? (
            <MicOff size={24} color="#fff" />
          ) : (
            <Mic size={24} color="#fff" />
          )}
          <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        {callType === 'video' && (
          <TouchableOpacity style={styles.controlBtn} onPress={handleVideoToggle}>
            {isVideoOff ? (
              <VideoOff size={24} color="#fff" />
            ) : (
              <Video size={24} color="#fff" />
            )}
            <Text style={styles.controlLabel}>{isVideoOff ? 'Show Video' : 'Hide Video'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.controlBtn}>
          <Volume2 size={24} color="#fff" />
          <Text style={styles.controlLabel}>Speaker</Text>
        </TouchableOpacity>
      </View>

      {/* Hang Up */}
      <TouchableOpacity style={styles.hangUpBtn} onPress={handleHangUp}>
        <PhoneOff size={30} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  header: {
    marginTop: Platform.OS === 'android' ? 50 : 60,
    alignItems: 'center',
  },
  callTypeLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.5,
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
    width: 160,
    height: 160,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pulseRing3: {
    width: 190,
    height: 190,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1565c0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 44,
    fontWeight: 'bold',
  },
  contactName: {
    marginTop: 24,
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  callStatus: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
  },
  controlsRow: {
    flexDirection: 'row',
    marginTop: 60,
    gap: 32,
    justifyContent: 'center',
  },
  controlBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 40,
    padding: 16,
    minWidth: 70,
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  hangUpBtn: {
    marginTop: 40,
    backgroundColor: '#e53935',
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#e53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
});

export default OutgoingCallScreen;

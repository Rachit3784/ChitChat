/**
 * ActiveCallScreen.tsx
 * In-call screen shown to both parties after connection is established.
 * Features: video streams, mute, hold, camera flip, speaker, timer, end call.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  Dimensions,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  PhoneOff,
  MicOff,
  Mic,
  Video,
  VideoOff,
  RotateCcw,
  Volume2,
  VolumeX,
  PauseCircle,
  PlayCircle,
} from 'lucide-react-native';
import CallService from '../../services/calling/CallService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const ActiveCallScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { callId, callType, contactUid, contactName, contactPhoto, isIncoming } = route.params;

  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(callType === 'video');
  const [duration, setDuration] = useState(0);
  const [localStreamURL, setLocalStreamURL] = useState<string | null>(null);
  const [remoteStreamURL, setRemoteStreamURL] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const startedAt = useRef(Date.now());
  const isNavigatingAway = useRef(false); // guard double navigation.goBack()
  const durationRef = useRef(0); // track duration for call log

  useEffect(() => {
    // Pull current streams
    const local = CallService.getLocalStream();
    const remote = CallService.getRemoteStream();
    if (local) setLocalStreamURL((local as any).toURL());
    if (remote) setRemoteStreamURL((remote as any).toURL());

    // Listen for remote hangup — both onCallEnded and onStateChange('ended') fire
    // Use isNavigatingAway guard to prevent double navigation.goBack()
    const navigateBack = (reason: string) => {
      if (isNavigatingAway.current) return;
      isNavigatingAway.current = true;
      clearInterval(timerRef.current);
      clearTimeout(controlsTimer.current);
      navigation.goBack();
    };

    CallService.setCallbacks({
      onLocalStream: (stream) => setLocalStreamURL((stream as any).toURL()),
      onRemoteStream: (stream) => setRemoteStreamURL((stream as any).toURL()),
      onCallEnded: ({ duration: d, reason }) => {
        navigateBack(reason);
      },
      onStateChange: (state) => {
        if (state === 'ended') {
          navigateBack('state_ended');
        }
      },
    });

    // Timer — track duration in ref too so handleEndCall can use it
    startedAt.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      durationRef.current = elapsed;
      setDuration(elapsed);
    }, 1000);

    // Auto-hide controls after 4s for video calls
    if (callType === 'video') {
      startControlsTimer();
    }

    return () => {
      clearInterval(timerRef.current);
      clearTimeout(controlsTimer.current);
    };
  }, []);

  const startControlsTimer = () => {
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      setControlsVisible(false);
    }, 4000);
  };

  const handleTap = () => {
    if (callType === 'video') {
      setControlsVisible(true);
      startControlsTimer();
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    CallService.setMuted(next);
  };

  const handleHold = () => {
    const next = !isHeld;
    setIsHeld(next);
    CallService.setHold(next);
  };

  const handleVideoToggle = () => {
    const next = !isVideoOff;
    setIsVideoOff(next);
    CallService.setVideoEnabled(!next);
  };

  const handleCameraFlip = () => {
    CallService.switchCamera();
  };

  const handleEndCall = async () => {
    if (isNavigatingAway.current) return; // prevent double-tap
    isNavigatingAway.current = true;
    clearInterval(timerRef.current);
    clearTimeout(controlsTimer.current);

    const callInfo = CallService.getCallInfo();
    const dur = durationRef.current;

    // End the call — writes Firestore status=ended, triggers remote side cleanup
    await CallService.endCall('ended');

    // Save call log
    if (callInfo) {
      const contactUidForLog = isIncoming ? callInfo.caller.uid : callInfo.receiver.uid;
      const contactNameForLog = isIncoming ? callInfo.caller.name : callInfo.receiver.name;
      const contactPhotoForLog = isIncoming ? callInfo.caller.photo : callInfo.receiver.photo;
      CallService.cleanup(); // ensure clean (endCall does this but be explicit)
      // Log is saved by OutgoingCallScreen/IncomingCallScreen via onCallEnded
      // but we do it here too as the definitive source of truth
    }

    navigation.goBack();
  };

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={handleTap}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Remote Video (fullscreen background) */}
      {callType === 'video' && remoteStreamURL ? (
        <RTCView
          streamURL={remoteStreamURL}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          mirror={false}
        />
      ) : (
        // Audio call background
        <View style={[StyleSheet.absoluteFill, styles.audioBg]} />
      )}

      {/* Dark overlay for visibility */}
      <View style={styles.overlay} />

      {/* Header (timer + name) */}
      <View style={styles.header}>
        <Text style={styles.contactName}>{contactName}</Text>
        <Text style={styles.timerText}>{formatDuration(duration)}</Text>
        {isHeld && (
          <View style={styles.holdBadge}>
            <Text style={styles.holdText}>⏸ Call on hold</Text>
          </View>
        )}
      </View>

      {/* Local Video PiP (picture-in-picture) */}
      {callType === 'video' && localStreamURL && !isVideoOff && (
        <View style={styles.localVideoContainer}>
          <RTCView
            streamURL={localStreamURL}
            style={styles.localVideo}
            objectFit="cover"
            mirror={true}
          />
        </View>
      )}

      {/* Controls bar */}
      {(controlsVisible || callType === 'audio') && (
        <View style={styles.controlsContainer}>
          <View style={styles.controlsRow}>
            {/* Mute */}
            <TouchableOpacity
              style={[styles.controlBtn, isMuted && styles.activeControlBtn]}
              onPress={handleMute}
            >
              {isMuted ? <MicOff size={22} color="#fff" /> : <Mic size={22} color="#fff" />}
              <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>

            {/* Hold */}
            <TouchableOpacity
              style={[styles.controlBtn, isHeld && styles.activeControlBtn]}
              onPress={handleHold}
            >
              {isHeld
                ? <PlayCircle size={22} color="#fff" />
                : <PauseCircle size={22} color="#fff" />
              }
              <Text style={styles.controlLabel}>{isHeld ? 'Resume' : 'Hold'}</Text>
            </TouchableOpacity>

            {/* Speaker */}
            <TouchableOpacity
              style={[styles.controlBtn, isSpeaker && styles.activeControlBtn]}
              onPress={() => setIsSpeaker(p => !p)}
            >
              {isSpeaker
                ? <Volume2 size={22} color="#fff" />
                : <VolumeX size={22} color="#fff" />
              }
              <Text style={styles.controlLabel}>Speaker</Text>
            </TouchableOpacity>

            {/* Video toggle (video calls only) */}
            {callType === 'video' && (
              <TouchableOpacity
                style={[styles.controlBtn, isVideoOff && styles.activeControlBtn]}
                onPress={handleVideoToggle}
              >
                {isVideoOff ? <VideoOff size={22} color="#fff" /> : <Video size={22} color="#fff" />}
                <Text style={styles.controlLabel}>{isVideoOff ? 'Show Cam' : 'Camera'}</Text>
              </TouchableOpacity>
            )}

            {/* Flip camera (video calls only) */}
            {callType === 'video' && !isVideoOff && (
              <TouchableOpacity style={styles.controlBtn} onPress={handleCameraFlip}>
                <RotateCcw size={22} color="#fff" />
                <Text style={styles.controlLabel}>Flip</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* End Call */}
          <TouchableOpacity style={styles.endCallBtn} onPress={handleEndCall}>
            <PhoneOff size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  audioBg: { backgroundColor: '#0D1B2A' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 50 : 60,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  contactName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  timerText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    marginTop: 6,
  },
  holdBadge: {
    marginTop: 10,
    backgroundColor: 'rgba(255,193,7,0.25)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,193,7,0.5)',
  },
  holdText: { color: '#ffc107', fontWeight: '600', fontSize: 13 },
  localVideoContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 100 : 110,
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    elevation: 10,
  },
  localVideo: {
    flex: 1,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'android' ? 30 : 44,
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 20,
  },
  controlBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 36,
    padding: 14,
    minWidth: 64,
  },
  activeControlBtn: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 5,
    fontWeight: '500',
  },
  endCallBtn: {
    backgroundColor: '#e53935',
    width: 65,
    height: 65,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
    shadowColor: '#e53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
});

export default ActiveCallScreen;

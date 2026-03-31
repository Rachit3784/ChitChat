import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, Dimensions, SafeAreaView } from 'react-native';
import { RTCPeerConnection, RTCView, mediaDevices, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import firestore from '@react-native-firebase/firestore';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Volume2, VolumeX } from 'lucide-react-native';
import CallManageService from '../../services/calling/CallManageService';
import CallLogService from '../../services/calling/CallLogService';
import userStore from '../../store/MyStore';

// Standard Audio Manager for WebRTC
let InCallManager: any = null;
try {
  InCallManager = require('react-native-incall-manager').default;
} catch (e) {
  console.warn("InCallManager not found. Audio routing may be poor. Please run: npm install react-native-incall-manager");
}

const { width, height } = Dimensions.get('window');

const CallActiveScreen = ({ route, navigation }: any) => {
  const { callId, isCaller } = route.params;

  // --- States ---
  const [localStream, setLocalStream] = useState<any>(null);
  const localStreamRef = useRef<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOnState, setIsSpeakerOn] = useState(true);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [callDuration, setCallDuration] = useState(0);
  const contactRef = useRef<any>(null); // To store name/photo for logging

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (connectionStatus === 'Connected') {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      // Start Audio Session when connected
      if (InCallManager) {
        InCallManager.start({ media: 'video' });
        InCallManager.setSpeakerphoneOn(true);
      }
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [connectionStatus]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- Refs ---
  const pc = useRef<any>(new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ]
  }));
  const remoteCandidatesBuffer = useRef<any[]>([]);
  const isRemoteDescriptionSet = useRef(false);

  useEffect(() => {
    let isMounted = true;
    CallManageService.isBusy = true;

    const showNotice = async () => {
      await notifee.cancelNotification(callId);
      const channelId = await notifee.createChannel({
        id: 'ongoing-calls',
        name: 'Ongoing Calls',
        importance: AndroidImportance.LOW,
      });
      await notifee.displayNotification({
        id: callId,
        title: 'Ongoing Call',
        body: 'Tap to return to call',
        data: { type: 'ongoing_call', callId: callId },
        android: {
          channelId,
          asForegroundService: true,
          ongoing: true,
          // Tapping the notification body brings the app to foreground
          pressAction: { id: 'default', launchActivity: 'default' },
          // End Call action works from notification shade or lock screen
          actions: [{ title: 'End Call', pressAction: { id: 'end_call', launchActivity: 'default' } }],
        }
      });
    };
    showNotice();

    const setupWebRTC = async (retryCount = 0) => {
      try {
        const stream: any = await mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (isMounted) {
          setLocalStream(stream);
          localStreamRef.current = stream;
        }

        stream.getTracks().forEach((track: any) => {
          pc.current.addTrack(track, stream);
        });

        pc.current.ontrack = (event: any) => {
          if (isMounted && event.streams[0]) {
            setRemoteStream(event.streams[0]);
            setConnectionStatus('Connected');
          }
        };

        pc.current.oniceconnectionstatechange = () => {
          const state = pc.current.iceConnectionState;
          console.log("[WebRTC] ICE State:", state);
          if (state === 'connected' || state === 'completed') {
            setConnectionStatus('Connected');
          } else if (state === 'failed') {
            setConnectionStatus('Connection Failed');
            // Auto-end the call so Firestore is updated and both sides clean up.
            // This prevents the stale 'accepted' state from flashing ActiveCallScreen
            // when the other user kills the app and comes back.
            firestore().collection('calls').doc(callId)
              .get().then(snap => {
                if (snap.data()?.status === 'accepted') {
                  firestore().collection('calls').doc(callId).update({ status: 'ended' });
                }
              }).catch(() => {});
          } else if (state === 'disconnected') {
            setConnectionStatus('Reconnecting...');
            // Give 5 seconds to recover before ending
            setTimeout(() => {
              if (!isMounted) return;
              const currentState = pc.current?.iceConnectionState;
              if (currentState === 'disconnected' || currentState === 'failed') {
                firestore().collection('calls').doc(callId).update({ status: 'ended' }).catch(() => {});
              }
            }, 5000);
          }
        };

        const callDoc = firestore().collection('calls').doc(callId);
        pc.current.onicecandidate = (event: any) => {
          if (event.candidate) {
            callDoc.collection(isCaller ? 'callerCandidates' : 'receiverCandidates')
              .add(event.candidate.toJSON());
          }
        };

        if (isCaller) {
          const offer = await pc.current.createOffer();
          await pc.current.setLocalDescription(offer);
          await callDoc.update({ offer: { sdp: offer.sdp, type: offer.type } });

          const unsubAnswer = callDoc.onSnapshot(doc => {
            const data = doc.data();
            if (data?.answer && pc.current.signalingState === 'have-local-offer') {
              pc.current.setRemoteDescription(new RTCSessionDescription(data.answer)).then(() => {
                isRemoteDescriptionSet.current = true;
                processBufferedCandidates();
              });
            }
          });

          const unsubIce = callDoc.collection('receiverCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(change => {
              if (change.type === 'added') handleRemoteCandidate(change.doc.data());
            });
          });
          return () => { unsubAnswer(); unsubIce(); };
        } else {
          const unsubOffer = callDoc.onSnapshot(async doc => {
            const data = doc.data();
            if (data?.offer && pc.current.signalingState === 'stable' && !isRemoteDescriptionSet.current) {
              await pc.current.setRemoteDescription(new RTCSessionDescription(data.offer));
              isRemoteDescriptionSet.current = true;
              const answer = await pc.current.createAnswer();
              await pc.current.setLocalDescription(answer);
              await callDoc.update({ answer: { sdp: answer.sdp, type: answer.type } });
              processBufferedCandidates();
            }
          });

          const unsubIce = callDoc.collection('callerCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(change => {
              if (change.type === 'added') handleRemoteCandidate(change.doc.data());
            });
          });
          return () => { unsubOffer(); unsubIce(); };
        }
      } catch (e: any) {
        console.error("WebRTC Setup Error:", e);
        if (e.message?.includes('No current Activity') && retryCount < 2) {
          console.log(`[WebRTC] Activity not ready, retrying in 1s... (Attempt ${retryCount + 1})`);
          setTimeout(() => setupWebRTC(retryCount + 1), 1000);
        }
      }
    };

    const handleRemoteCandidate = (candidateData: any) => {
      if (isRemoteDescriptionSet.current) {
        pc.current.addIceCandidate(new RTCIceCandidate(candidateData));
      } else {
        remoteCandidatesBuffer.current.push(candidateData);
      }
    };

    const processBufferedCandidates = () => {
      while (remoteCandidatesBuffer.current.length > 0) {
        const candidate = remoteCandidatesBuffer.current.shift();
        pc.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    // Kill-mode fix: Wait for Activity to be fully initialized before requesting media
    const { InteractionManager } = require('react-native');
    InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
            if (isMounted) setupWebRTC();
        }, 500);
    });

    const unsubStatus = firestore().collection('calls').doc(callId).onSnapshot(doc => {
      if (!doc.exists) return;
      const data = doc.data();
      const status = data?.status;

      // Store contact info for logging
      if (!contactRef.current && data) {
        const isMeCaller = data.callerId === userStore.getState().userModelID;
        contactRef.current = {
          uid: isMeCaller ? data.receiverId : data.callerId,
          name: isMeCaller ? (data.receiverName || 'User') : data.callerName,
          photo: isMeCaller ? data.receiverPhoto : data.callerPhoto,
          type: data.type || 'audio',
          direction: isMeCaller ? 'outgoing' : 'incoming'
        };
      }

      if (['ended', 'cancelled', 'declined', 'missed'].includes(status)) {
        cleanupAndExit();
      }
    });

    return () => {
      isMounted = false;
      unsubStatus();
      cleanup();
    };
  }, []);

  const cleanup = () => {
    // Save to local log before cleaning up
    if (contactRef.current) {
      CallLogService.saveCallLog({
        id: callId,
        contactUid: contactRef.current.uid,
        contactName: contactRef.current.name,
        contactPhoto: contactRef.current.photo || null,
        callType: contactRef.current.type,
        direction: contactRef.current.direction,
        status: 'completed',
        startedAt: Date.now() - (callDuration * 1000),
        duration: callDuration
      });
    }

    if (InCallManager) InCallManager.stop();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t: any) => t.stop());
    pc.current.close();
    notifee.stopForegroundService();
    notifee.cancelNotification(callId);
    CallManageService.isBusy = false;
  };

  const cleanupAndExit = () => {
    cleanup();
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { path: 'Home' });
  };

  const endCall = async () => {
    await firestore().collection('calls').doc(callId).update({ status: 'ended' });
    cleanupAndExit();
  };

  // --- Interaction Handlers ---
  const toggleMute = () => {
    try {
      const stream = localStreamRef.current || localStream;
      if (stream) {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const newMuted = !isMuted;
          audioTracks.forEach((track: any) => (track.enabled = !newMuted));
          setIsMuted(newMuted);
        }
      }
    } catch (e) { console.error("Mute Toggle Error:", e); }
  };

  const toggleSpeaker = () => {
    if (InCallManager) {
      const nextSpeakerState = !isSpeakerOnState;
      InCallManager.setSpeakerphoneOn(nextSpeakerState);
      setIsSpeakerOn(nextSpeakerState);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      const newCameraOff = !isCameraOff;
      localStream.getVideoTracks().forEach((track: any) => (track.enabled = !newCameraOff));
      setIsCameraOff(newCameraOff);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.timerText}>
          {connectionStatus === 'Connected' ? formatDuration(callDuration) : connectionStatus}
        </Text>
        {isMuted && <Text style={styles.mutedWarning}>Microphone Muted</Text>}
      </View>

      <View style={styles.remoteWrapper}>
        {remoteStream ? (
          <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} objectFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.connectingText}>{connectionStatus}</Text>
          </View>
        )}
      </View>

      <View style={styles.localWrapper}>
        {localStream && !isCameraOff ? (
          <RTCView streamURL={localStream.toURL()} style={styles.localVideo} objectFit="cover" zOrder={1} mirror={true} />
        ) : (
          <View style={[styles.localVideo, { backgroundColor: '#444', justifyContent: 'center', alignItems: 'center' }]}>
            <VideoOff color="#fff" size={24} />
          </View>
        )}
      </View>

      <View style={styles.controlBar}>
        <TouchableOpacity style={[styles.btn, isMuted && styles.btnActive]} onPress={toggleMute}>
          {isMuted ? <MicOff color="#fff" size={28} /> : <Mic color="#fff" size={28} />}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, !isSpeakerOnState && styles.btnActive]} onPress={() => {
          if (InCallManager) {
            const next = !isSpeakerOnState;
            InCallManager.setSpeakerphoneOn(next);
            setIsSpeakerOn(next);
          }
        }}>
          {isSpeakerOnState ? <Volume2 color="#fff" size={28} /> : <VolumeX color="#fff" size={28} />}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, isCameraOff && styles.btnActive]} onPress={toggleCamera}>
          {isCameraOff ? <VideoOff color="#fff" size={28} /> : <VideoIcon color="#fff" size={28} />}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.endBtn]} onPress={endCall}>
          <PhoneOff color="#fff" size={32} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1c1c1e' },
  headerBlock: {
    position: 'absolute', top: 50, alignSelf: 'center', zIndex: 10,
    alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8
  },
  timerText: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: 1 },
  mutedWarning: { color: '#ff3b30', fontSize: 12, fontWeight: '700', marginTop: 2 },
  remoteWrapper: { flex: 1, backgroundColor: '#000' },
  remoteVideo: { width: '100%', height: '100%' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  connectingText: { color: '#8e8e93', fontSize: 20, fontWeight: '500' },
  localWrapper: {
    position: 'absolute', top: 60, right: 20,
    width: 100, height: 150, borderRadius: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 100
  },
  localVideo: { width: '100%', height: '100%' },
  controlBar: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(58, 58, 60, 0.8)',
    paddingHorizontal: 15, paddingVertical: 15, borderRadius: 45,
  },
  btn: {
    width: 54, height: 54, borderRadius: 27,
    justifyContent: 'center', alignItems: 'center',
    marginHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.1)'
  },
  btnActive: { backgroundColor: '#ff3b30' },
  endBtn: { backgroundColor: '#eb5545', width: 64, height: 64, borderRadius: 32 }
});

export default CallActiveScreen;
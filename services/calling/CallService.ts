/**
 * CallService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Industrial-grade WebRTC P2P Calling Service
 * Handles: offer/answer, ICE gathering (STUN), mute, hold, camera flip,
 *          speaker routing, call state machine, Firestore signaling, cleanup.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import firestore from '@react-native-firebase/firestore';
import database from '@react-native-firebase/database';
import { PermissionsAndroid, Platform } from 'react-native';

// ── STUN / TURN Config ────────────────────────────────────────────────────────
// For production, add TURN servers from metered.ca or Twilio (needed for symmetric NAT)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

// ── Call State ─────────────────────────────────────────────────────────────────
export type CallState = 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'declined' | 'missed';
export type CallType = 'video' | 'audio';

export interface CallParticipant {
  uid: string;
  name: string;
  photo?: string | null;
}

export interface ActiveCallInfo {
  callId: string;
  caller: CallParticipant;
  receiver: CallParticipant;
  callType: CallType;
  isIncoming: boolean;
  state: CallState;
  startTime?: number;
}

// ── Callbacks ─────────────────────────────────────────────────────────────────
interface CallServiceCallbacks {
  onStateChange?: (state: CallState) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onCallEnded?: (info: { duration: number; reason: string }) => void;
  onError?: (error: Error) => void;
}

// ─────────────────────────────────────────────────────────────────────────────

class CallService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callId: string | null = null;
  private callInfo: ActiveCallInfo | null = null;
  private callbacks: CallServiceCallbacks = {};
  private callStartTime: number | null = null;
  private iceCandidateBuffer: RTCIceCandidate[] = [];
  private firestoreUnsubscribers: (() => void)[] = [];
  private isCaller = false;

  // ── Getters ────────────────────────────────────────────────────────────────

  public getCallId(uid1: string, uid2: string): string {
    return [uid1, uid2].sort().join('_');
  }

  public getLocalStream() { return this.localStream; }
  public getRemoteStream() { return this.remoteStream; }
  public getCallInfo() { return this.callInfo; }
  public isInCall() { return this.callInfo !== null && this.callInfo.state !== 'ended'; }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  public setCallbacks(cbs: CallServiceCallbacks) {
    this.callbacks = { ...this.callbacks, ...cbs };
  }

  // ── Permissions ───────────────────────────────────────────────────────────

  public async requestPermissions(callType: CallType): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const perms: any[] = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      if (callType === 'video') {
        perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }

      const results = await PermissionsAndroid.requestMultiple(perms);

      const audioGranted = results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === 'granted';
      const videoGranted = callType === 'audio' || results[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted';

      return audioGranted && videoGranted;
    } catch (e) {
      console.error('[CallService] Permission error:', e);
      return false;
    }
  }

  // ── Media ─────────────────────────────────────────────────────────────────

  private async getLocalMedia(callType: CallType): Promise<MediaStream> {
    const constraints = {
      audio: true,
      video: callType === 'video'
        ? { facingMode: 'user', width: 640, height: 480 }
        : false,
    };

    const stream = await mediaDevices.getUserMedia(constraints);
    return stream as MediaStream;
  }

  // ── Peer Connection Factory ────────────────────────────────────────────────

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS) as any;

    // ICE candidate gathering — these are the public IPs from STUN
    pc.onicecandidate = async (event: any) => {
      if (event.candidate) {
        await this.uploadIceCandidate(event.candidate);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CallService] ICE state:', pc.iceConnectionState);
      const state = pc.iceConnectionState;

      if (state === 'connected' || state === 'completed') {
        this.callStartTime = Date.now();
        this.updateCallState('connected');
        this.updateFirestoreStatus('accepted');
      } else if (state === 'failed') {
        this.handleConnectionFailure();
      } else if (state === 'disconnected') {
        // Brief disconnection — try ICE restart before ending
        setTimeout(() => {
          if (this.pc && (this.pc as any).iceConnectionState === 'disconnected') {
            this.handleConnectionFailure();
          }
        }, 5000);
      }
    };

    // Remote track received
    pc.ontrack = (event: any) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream() as any;
      }
      (this.remoteStream as any).addTrack(event.track);
      this.callbacks.onRemoteStream?.(this.remoteStream!);
    };

    return pc as RTCPeerConnection;
  }

  // ── Initiate Outgoing Call ─────────────────────────────────────────────────

  public async startCall(
    myUid: string,
    myName: string,
    myPhoto: string | undefined,
    contactUid: string,
    contactName: string,
    contactPhoto: string | undefined,
    callType: CallType,
  ): Promise<string> {
    if (this.isInCall()) throw new Error('Already in a call');

    // 0. Check true RTDB Presence
    try {
      const snap = await database().ref(`/presence/${contactUid}`).once('value');
      const presenceState = snap.val()?.state;
      if (presenceState === 'offline') {
        throw new Error('User is offline and cannot receive calls.');
      }
    } catch (e: any) {
      if (e.message.includes('offline')) throw e;
    }

    const hasPermission = await this.requestPermissions(callType);
    if (!hasPermission) throw new Error('Permissions denied');

    const callId = this.getCallId(myUid, contactUid);
    this.callId = callId;
    this.isCaller = true;

    this.callInfo = {
      callId,
      caller: { uid: myUid, name: myName, photo: myPhoto },
      receiver: { uid: contactUid, name: contactName, photo: contactPhoto },
      callType,
      isIncoming: false,
      state: 'ringing',
    };

    this.updateCallState('ringing');

    // 1. Get local media
    this.localStream = await this.getLocalMedia(callType);
    this.callbacks.onLocalStream?.(this.localStream);

    // 2. Create peer connection & add tracks
    this.pc = this.createPeerConnection();
    (this.localStream as any).getTracks().forEach((track: any) => {
      (this.pc as any).addTrack(track, this.localStream!);
    });

    // 3. Create offer SDP
    const offer = await (this.pc as any).createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: callType === 'video',
    });
    await (this.pc as any).setLocalDescription(offer);

    // 4. Write call document to Firestore via Transaction (Busy Logic)
    await firestore().runTransaction(async (transaction) => {
      const receiverRef = firestore().collection('users').doc(contactUid);
      const receiverDoc = await transaction.get(receiverRef);

      const receiverData = receiverDoc.data();
      if (receiverData) {
        if (receiverData.availability === 'offline') {
          throw new Error('User is offline and cannot receive calls.');
        }
        if (receiverData.callingStatus === 'busy') {
          throw new Error('User is currently on another call.');
        }
      }

      // Lock both users
      const myRef = firestore().collection('users').doc(myUid);
      transaction.update(receiverRef, { callingStatus: 'busy', lastCaller: myUid });
      transaction.update(myRef, { callingStatus: 'busy' });

      // Create call document
      const callRef = firestore().collection('calls').doc(callId);
      transaction.set(callRef, {
        callId,
        callerUid: myUid,
        receiverUid: contactUid,
        callerName: myName,
        callerPhoto: myPhoto || null,
        receiverName: contactName,
        receiverPhoto: contactPhoto || null,
        type: callType,
        status: 'ringing',
        offer: { type: offer.type, sdp: offer.sdp },
        answer: null,
        startedAt: Date.now(),
        endedAt: null,
        duration: null,
      });
    });

    // 5. Listen for answer from receiver
    this.listenForAnswer(callId);

    // 6. Listen for receiver's ICE candidates
    this.listenForIceCandidates(callId, 'receiverCandidates');

    // 7. Auto-cancel after 60 seconds (no answer)
    setTimeout(() => {
      if (this.callInfo?.state === 'ringing') {
        this.endCall('missed');
      }
    }, 60000);

    return callId;
  }

  // ── Accept Incoming Call ───────────────────────────────────────────────────

  public async acceptCall(
    callId: string,
    myUid: string,
    myName: string,
    myPhoto: string | undefined,
    callerUid: string,
    callerName: string,
    callerPhoto: string | undefined,
    callType: CallType,
  ): Promise<void> {
    const hasPermission = await this.requestPermissions(callType);
    if (!hasPermission) throw new Error('Permissions denied');

    this.callId = callId;
    this.isCaller = false;

    this.callInfo = {
      callId,
      caller: { uid: callerUid, name: callerName, photo: callerPhoto },
      receiver: { uid: myUid, name: myName, photo: myPhoto },
      callType,
      isIncoming: true,
      state: 'connecting',
    };

    this.updateCallState('connecting');

    // 1. Get local media
    this.localStream = await this.getLocalMedia(callType);
    this.callbacks.onLocalStream?.(this.localStream);

    // 2. Create peer connection & add tracks
    this.pc = this.createPeerConnection();
    (this.localStream as any).getTracks().forEach((track: any) => {
      (this.pc as any).addTrack(track, this.localStream!);
    });

    // 3. Fetch offer from Firestore
    const callDoc = await firestore().collection('calls').doc(callId).get();
    const callData = callDoc.data();
    if (!callData?.offer) throw new Error('No offer found');

    // 4. Set remote description with offer
    await (this.pc as any).setRemoteDescription(
      new RTCSessionDescription(callData.offer)
    );

    // 5. Add any buffered ICE candidates
    for (const candidate of this.iceCandidateBuffer) {
      await (this.pc as any).addIceCandidate(candidate);
    }
    this.iceCandidateBuffer = [];

    // 6. Create answer SDP
    const answer = await (this.pc as any).createAnswer();
    await (this.pc as any).setLocalDescription(answer);

    // 7. Write answer to Firestore
    await firestore().collection('calls').doc(callId).update({
      answer: { type: answer.type, sdp: answer.sdp },
      status: 'accepted',
    });

    // 8. Listen for caller's ICE candidates
    this.listenForIceCandidates(callId, 'callerCandidates');

    // 9. █ KEY FIX: Receiver must also watch the call doc for remote hangup.
    //    Without this, when the caller ends the call, the receiver’s ActiveCallScreen
    //    never hears about it and stays open forever.
    this.listenForRemoteHangup(callId);
  }

  // ── Firestore Signaling Listeners ──────────────────────────────────────────

  // █ KEY FIX: Shared listener for BOTH sides to detect remote hangup / cancel.
  // Caller uses listenForAnswer (which also watches status).
  // Receiver calls this after acceptCall() so it can react to status=ended.
  private listenForRemoteHangup(callId: string) {
    const unsub = firestore()
      .collection('calls')
      .doc(callId)
      .onSnapshot((snapshot) => {
        const data = snapshot.data();
        // Doc deleted entirely
        if (!snapshot.exists || !data) {
          this.handleRemoteEnd('remote_ended');
          return;
        }
        if (data.status === 'ended' && this.callInfo?.state !== 'ended') {
          this.handleRemoteEnd('remote_ended');
        } else if (data.status === 'declined' && this.callInfo?.state !== 'ended') {
          this.handleRemoteEnd('declined');
        }
      });
    this.firestoreUnsubscribers.push(unsub);
  }

  // Called when the REMOTE side ends/declines — does NOT re-write Firestore
  private handleRemoteEnd(reason: string) {
    if (!this.callInfo || this.callInfo.state === 'ended') return; // guard double-fire
    const duration = this.callStartTime
      ? Math.floor((Date.now() - this.callStartTime) / 1000)
      : 0;
    this.callbacks.onCallEnded?.({ duration, reason });
    this.updateCallState('ended');
    this.cleanup();
  }

  private listenForAnswer(callId: string) {
    const unsub = firestore()
      .collection('calls')
      .doc(callId)
      .onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        // Status changed to declined or ended by receiver
        if (data.status === 'declined') {
          this.handleRemoteEnd('declined');
          return;
        } else if (data.status === 'ended' && this.callInfo?.state !== 'ended') {
          this.handleRemoteEnd('remote_ended');
          return;
        }

        // Answer received
        if (data.answer && this.pc) {
          const currentRemote = (this.pc as any).remoteDescription;
          if (!currentRemote) {
            try {
              await (this.pc as any).setRemoteDescription(
                new RTCSessionDescription(data.answer)
              );
              this.updateCallState('connecting');
            } catch (e) {
              console.error('[CallService] setRemoteDescription error:', e);
            }
          }
        }
      });

    this.firestoreUnsubscribers.push(unsub);
  }

  private listenForIceCandidates(callId: string, collection: 'callerCandidates' | 'receiverCandidates') {
    const unsub = firestore()
      .collection('calls')
      .doc(callId)
      .collection(collection)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const candidateData = change.doc.data();
            const candidate = new RTCIceCandidate(candidateData);

            if (this.pc && (this.pc as any).remoteDescription) {
              try {
                await (this.pc as any).addIceCandidate(candidate);
              } catch (e) {
                console.error('[CallService] addIceCandidate error:', e);
              }
            } else {
              // Buffer until remote description is set
              this.iceCandidateBuffer.push(candidate);
            }
          }
        });
      });

    this.firestoreUnsubscribers.push(unsub);
  }

  private async uploadIceCandidate(candidate: RTCIceCandidate) {
    if (!this.callId) return;
    const collection = this.isCaller ? 'callerCandidates' : 'receiverCandidates';
    try {
      await firestore()
        .collection('calls')
        .doc(this.callId)
        .collection(collection)
        .add((candidate as any).toJSON());
    } catch (e) {
      console.error('[CallService] uploadIceCandidate error:', e);
    }
  }

  // ── End / Decline Call ────────────────────────────────────────────────────

  public async endCall(reason: string = 'ended') {
    if (!this.callId) return;
    // Guard: if already ended, don't double-write Firestore
    if (this.callInfo?.state === 'ended') return;

    const duration = this.callStartTime
      ? Math.floor((Date.now() - this.callStartTime) / 1000)
      : 0;

    try {
      await firestore().collection('calls').doc(this.callId).update({
        status: 'ended',
        endedAt: Date.now(),
        duration,
      });
    } catch (e) {
      console.error('[CallService] endCall Firestore error:', e);
    }

    this.callbacks.onCallEnded?.({ duration, reason });
    this.updateCallState('ended');
    this.cleanup();
  }

  public async declineCall(callId: string) {
    try {
      await firestore().collection('calls').doc(callId).update({
        status: 'declined',
        endedAt: Date.now(),
        duration: 0,
      });
    } catch (e) {
      console.error('[CallService] declineCall error:', e);
    }
    this.cleanup();
  }

  // ── In-Call Controls ──────────────────────────────────────────────────────

  public setMuted(muted: boolean) {
    if (!this.localStream) return;
    (this.localStream as any).getAudioTracks().forEach((track: any) => {
      track.enabled = !muted;
    });
  }

  public setVideoEnabled(enabled: boolean) {
    if (!this.localStream) return;
    (this.localStream as any).getVideoTracks().forEach((track: any) => {
      track.enabled = enabled;
    });
  }

  public setHold(hold: boolean) {
    if (!this.localStream) return;
    (this.localStream as any).getTracks().forEach((track: any) => {
      track.enabled = !hold;
    });
  }

  public async switchCamera() {
    if (!this.localStream) return;
    const videoTracks = (this.localStream as any).getVideoTracks();
    if (videoTracks.length > 0) {
      await videoTracks[0]._switchCamera();
    }
  }

  // ── Internal Helpers ──────────────────────────────────────────────────────

  private updateCallState(state: CallState) {
    if (this.callInfo) {
      this.callInfo.state = state;
    }
    this.callbacks.onStateChange?.(state);
  }

  private async updateFirestoreStatus(status: string) {
    if (!this.callId) return;
    try {
      await firestore().collection('calls').doc(this.callId).update({ status });
    } catch (e) { /* ignore */ }
  }

  private handleConnectionFailure() {
    console.warn('[CallService] Connection failed');
    this.callbacks.onError?.(new Error('Network connection failed'));
    this.endCall('connection_failed');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  public cleanup() {
    // Unlock my callingStatus in Firestore (if we were in a call)
    if (this.callInfo) {
      const myUid = this.isCaller ? this.callInfo.caller.uid : this.callInfo.receiver.uid;
      firestore().collection('users').doc(myUid).update({ callingStatus: 'free' }).catch(() => {});
    }

    // Unsubscribe all Firestore listeners
    this.firestoreUnsubscribers.forEach(u => u());
    this.firestoreUnsubscribers = [];

    // Stop all local media tracks
    if (this.localStream) {
      (this.localStream as any).getTracks().forEach((track: any) => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.pc) {
      (this.pc as any).close();
      this.pc = null;
    }

    // Reset state
    this.remoteStream = null;
    this.callId = null;
    this.callInfo = null;
    this.callStartTime = null;
    this.iceCandidateBuffer = [];
    this.isCaller = false;
  }

  // ── Incoming Call Listener (Global via IncomingCallOverlay) ───────────────
  // Watches for calls WITH status=ringing addressed to this user.
  // █ KEY FIX: 'removed' fires when status changes AWAY from 'ringing'
  //   (Firestore removes doc from query result). This is how we detect
  //   "caller cancelled before pickup" and dismiss the overlay/notification.

  public listenForIncomingCalls(
    myUid: string,
    onIncomingCall: (callData: any) => void,
    onCallCancelled: (callId: string) => void,
  ): () => void {
    const unsub = firestore()
      .collection('calls')
      .where('receiverUid', '==', myUid)
      .where('status', '==', 'ringing')
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            // Only show calls started in the last 2 minutes (stale call guard)
            const isRecent = Date.now() - (data.startedAt || 0) < 120000;
            if (isRecent) {
              onIncomingCall({ id: change.doc.id, ...data });
            }
          }

          // 'modified' shouldn't happen (status is filtered), but keep as safety
          if (change.type === 'modified') {
            const data = change.doc.data();
            if (data.status !== 'ringing') {
              onCallCancelled(change.doc.id);
            }
          }

          // █ THIS IS THE KEY FIX:
          // When the caller cancels/ends the call, Firestore changes status
          // from 'ringing' to 'ended'. The document no longer matches the
          // where('status','==','ringing') query, so it fires as 'removed'.
          // Without this handler the receiver’s screen NEVER dismisses.
          if (change.type === 'removed') {
            onCallCancelled(change.doc.id);
          }
        });
      });

    return unsub;
  }
}

export default new CallService();

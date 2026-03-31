import { PermissionsAndroid, Platform, Alert, Linking } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import axios from 'axios';
import { RTCPeerConnection } from 'react-native-webrtc';
import userStore from '../../store/MyStore';
import NavigationService from '../NavigationService';

class CallManageService {
  constructor() {
    // TIP: For local testing, use your local IP: http://192.168.x.x:5221
    // this.baseUrl = 'http://10.219.238.27:5221';
    this.baseUrl = 'https://push-notification-dvsr.onrender.com';
    this.api = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000, // 10s timeout
    });
  }

  get isBusy() {
    return userStore.getState().isBusy;
  }

  set isBusy(val) {
    userStore.getState().setIsBusy(val);
  }

  // 1. Permission Check & Request
  async requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        return (
          granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  }

  // 2. Global Busy Sync (Pro-Tip)
  async syncBusyStateOnStart(userId) {
    if (!userId) return;
    try {
      console.log("[CallManageService] Syncing busy state for:", userId);
      const activeCalls = await firestore().collection('calls')
        .where('receiverId', '==', userId)
        .where('status', 'in', ['initiating', 'ringing', 'accepted'])
        .get();

      if (!activeCalls.empty) {
        console.log(`[CallManageService] Found ${activeCalls.size} call sessions.`);
        const batch = firestore().batch();
        activeCalls.docs.forEach(doc => {
          if (doc.data().status === 'accepted') {
            // Only restore if the call started within the last 10 minutes
            // (prevents stale 'accepted' state from incorrectly restoring old calls)
            const callAge = Date.now() - (doc.data().initiationTimestamp || 0);
            if (callAge < 600000) {
              NavigationService.navigate('Screens', {
                screen: 'ActiveCallScreen',
                params: { callId: doc.id, isCaller: false }
              });
            } else {
              // Stale accepted call — mark ended
              batch.update(doc.ref, { status: 'ended' });
            }
          } else {
            batch.update(doc.ref, { status: 'missed' });
          }
        });
        await batch.commit();
      }
      this.isBusy = false;
    } catch (e) {
      console.error("Busy Sync Error:", e);
    }
  }

  // 3. Battery Optimization Check (Pro-Tip)
  async checkBatteryOptimization() {
    if (Platform.OS === 'android') {
      console.log("[CallManageService] Battery optimization check recommended for background calls.");
    }
  }

  // 4. Initiate Call Function
  async initiateCall(senderData, receiverId, receiverName, receiverPhoto = null, callType = 'audio') {
    if (this.isBusy) {
      console.warn("Call initiation blocked: App is already in a call state.");
      return { success: false, message: 'App is busy' };
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      Alert.alert("Permissions Required", "Camera and Mic permissions are needed to make a call.");
      return { success: false, message: 'Permission denied' };
    }

    this.isBusy = true;

    let callerIP = "0.0.0.0";
    try {
      callerIP = await this.getPublicIP();
    } catch (e) {
      console.warn("Could not fetch public IP, proceeding with fallback:", e);
    }

    try {
      // Step A: Create Call Document in Firestore (Phase 1)
      const callRef = await firestore().collection('calls').add({
        callerId: senderData.id,
        callerName: senderData.name,
        callerPhoto: senderData.photo || null,
        callerIP: callerIP,
        receiverId: receiverId,
        receiverName: receiverName || 'User',
        receiverPhoto: receiverPhoto || null,
        type: callType || 'audio',
        status: 'initiating',
        initiationTimestamp: Date.now(),
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // Step B: Immediate UI Transition (Phase 1)
      NavigationService.navigate('Screens', {
        screen: 'OutgoingCallScreen',
        params: {
          callId: callRef.id,
          receiverId: receiverId,
          receiverName: receiverName || 'User',
          receiverPhoto: receiverPhoto,
          callType: callType
        }
      });

      // Step C: Trigger Node.js for Push Signaling (Phase 1 & 2)
      this.api.post('/call/request', {
        callId: callRef.id,
        senderId: senderData.id,
        senderName: senderData.name,
        receiverId: receiverId,
        timestamp: Date.now(),
      }).then(res => {
        if (res.data.status === 'busy') {
          this.updateCallStatus(callRef.id, 'user_unavailable');
          Alert.alert("User Busy", "The recipient is currently on another call.");
        }
      }).catch(err => {
        const errMsg = err.response ? `Status ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;
        console.error("Backend Call Request Failed:", errMsg);
        this.updateCallStatus(callRef.id, 'failed');
        this.isBusy = false;
      });

      return { success: true, callId: callRef.id };

    } catch (error) {
      console.error("Call Initiation Error:", error);
      this.isBusy = false;
      return { success: false, message: 'Network error or Signaling failed' };
    }
  }

  // 4b. Robust Cancel Call
  async cancelCall(callId, receiverId) {
    let finalReceiverId = receiverId;
    try {
      if (!finalReceiverId) {
        console.warn(`[CallManageService] receiverId missing for ${callId}. Fetching from Firestore...`);
        const callDoc = await firestore().collection('calls').doc(callId).get();
        finalReceiverId = callDoc.data()?.receiverId;
      }
      if (!finalReceiverId) throw new Error("Could not resolve receiverId for cancellation.");

      await this.api.post('/call/cancel', { callId, receiverId: finalReceiverId });
      console.log(`[CallManageService] Cancellation signal sent for ${callId}`);
    } catch (e) {
      const errorMsg = e.response ? `Status ${e.response.status}: ${JSON.stringify(e.response.data)}` : e.message;
      console.error(`[CallManageService] Cancel Signal ERROR: ${errorMsg}`);
    }
  }

  // 5. Update Status (Helper)
  async updateCallStatus(callId, status) {
    try {
      await firestore().collection('calls').doc(callId).update({ status });
      if (['ended', 'cancelled', 'declined', 'user_unavailable', 'missed', 'failed'].includes(status)) {
        this.isBusy = false;
      }
    } catch (e) {
      console.error("Update Status Error:", e);
    }
  }

  async getPublicIP() {
    return new Promise((resolve, reject) => {
      const configuration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
      };
      const pc = new RTCPeerConnection(configuration);
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
          const ipAddress = candidate.match(ipRegex);
          if (ipAddress && ipAddress[1] && candidate.includes('srflx')) {
            resolve(ipAddress[1]);
            pc.close();
          }
        }
      };
      pc.createDataChannel('fake_channel');
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch((err) => reject(err));
      setTimeout(() => { pc.close(); resolve("0.0.0.0"); }, 3000);
    });
  }
}

export default new CallManageService();

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { PhoneOff } from 'lucide-react-native';
import CallManageService from '../../services/calling/CallManageService';
import CallLogService from '../../services/calling/CallLogService';

const { width } = Dimensions.get('window');

const OutgoingCallScreen = ({ route, navigation }: { route: any, navigation: any }) => {
  const { callId, receiverId, receiverName, receiverPhoto, callType } = route.params;
  const [callStatus, setCallStatus] = useState('Calling...');
  const [playAudio, setPlayAudio] = useState(true);

  useEffect(() => {
    const unsubscribe = firestore().collection('calls').doc(callId)
      .onSnapshot(doc => {
        const data = doc.data();
        if (!doc.exists || !data) return;

        if (data.status === 'ringing') {
          setCallStatus('Ringing...');
        } else if (data.status === 'accepted') {
          setCallStatus('Connecting...');
          navigation.replace('Screens', { 
            screen: 'ActiveCallScreen', 
            params: { callId, isCaller: true } 
          });
        } else if (['cancelled', 'declined', 'user_unavailable', 'missed', 'failed'].includes(data.status)) {
          CallManageService.isBusy = false;
          navigation.goBack();
        }
      });

    // 45s Timeout fallback
    const timeout = setTimeout(() => {
        CallLogService.saveCallLog({
           id: callId,
           contactUid: receiverId,
           contactName: receiverName || 'User',
           contactPhoto: receiverPhoto || null,
           callType: callType || 'audio',
           direction: 'outgoing',
           status: 'missed',
           startedAt: Date.now(),
           duration: 0
        });
        firestore().collection('calls').doc(callId).update({ status: 'missed' });
    }, 45000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [callId]);

  const endCall = async () => {
    try {
      CallManageService.isBusy = false;
      // 1. Signal cancellation to receiver via backend
      if (callId && receiverId) {
        await CallManageService.cancelCall(callId, receiverId);
      }
      // 2. Local Log
      CallLogService.saveCallLog({
         id: callId,
         contactUid: receiverId,
         contactName: receiverName || 'User',
         contactPhoto: receiverPhoto || null,
         callType: callType || 'audio',
         direction: 'outgoing',
         status: 'declined', // User manually cancelled
         startedAt: Date.now(),
         duration: 0
      });
      // 3. Update Firestore status
      await firestore().collection('calls').doc(callId).update({ status: 'cancelled' });
      navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'Home' });
    } catch (e) {
      console.error("End Call Error:", e);
      CallManageService.isBusy = false;
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
  container: { flex: 1, backgroundColor: '#1c1c1e', justifyContent: 'space-around', alignItems: 'center' },
  infoContainer: { alignItems: 'center' },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 20 },
  placeholderAvatar: { backgroundColor: '#3a3a3c', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  name: { color: '#fff', fontSize: 28, fontWeight: '600', marginBottom: 10 },
  status: { color: '#8e8e93', fontSize: 18 },
  controls: { width: '100%', alignItems: 'center' },
  endButton: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#ff3b30',
    justifyContent: 'center', alignItems: 'center', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10
  }
});

export default OutgoingCallScreen;
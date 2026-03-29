import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, Alert } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import Video from 'react-native-video';
import CallManageService from '../../services/calling/CallManageService';

const { width } = Dimensions.get('window');

const OutgoingCallScreen = ({ route, navigation }) => {
  const { callId, receiverName } = route.params;
  const [callStatus, setCallStatus] = useState('Calling...');
  const [playAudio, setPlayAudio] = useState(true);

  useEffect(() => {
    // Status listen karo (Phase 2 & 4)
    const unsubscribe = firestore().collection('calls').doc(callId)
      .onSnapshot(doc => {
        const data = doc.data();
        if (!doc.exists || !data) return;
        
        if (data.status === 'ringing') {
          setCallStatus('Ringing...');
        } else if (data.status === 'accepted') {
          setPlayAudio(false); // Stop sound immediately
          setTimeout(() => {
            navigation.replace('ActiveCallScreen', { callId, isCaller: true });
          }, 300); // Allow video player to pause before unmounting
        } else if (data.status === 'declined') {
          CallManageService.isBusy = false;
          setPlayAudio(false);
          setCallStatus('Call Declined');
          setTimeout(() => navigation.goBack(), 1500);
        } else if (data.status === 'user_unavailable') {
          CallManageService.isBusy = false;
          setPlayAudio(false);
          setCallStatus('User Busy or Offline');
          setTimeout(() => navigation.goBack(), 2000);
        } else if (['missed', 'cancelled', 'ended'].includes(data.status)) {
          CallManageService.isBusy = false;
          setPlayAudio(false);
          navigation.goBack();
        }
      });
    return () => unsubscribe();
  }, [callId]);

  const endCall = async () => {
    try {
        CallManageService.isBusy = false;
        await firestore().collection('calls').doc(callId).update({ status: 'cancelled' });
        navigation.goBack();
    } catch (e) {
        console.error("End Call Error:", e);
        CallManageService.isBusy = false;
        navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Outgoing Bell Sound (Phase 1) */}
      {playAudio && ['Calling...', 'Ringing...'].includes(callStatus) && (
        <Video
          source={require('../../asset/outgoingBell.mp3')}
          repeat={true}
          paused={false}
          playInBackground={true}
          style={{ width: 0, height: 0 }}
        />
      )}

      <View style={styles.infoContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{receiverName?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{receiverName}</Text>
        <Text style={styles.status}>{callStatus}</Text>
      </View>


      <View style={styles.bottomContainer}>
        <TouchableOpacity onPress={endCall} style={styles.endButton}>
          <Text style={styles.buttonIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.buttonLabel}>End Call</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1c1c1e', justifyContent: 'space-between', alignItems: 'center' },
  infoContainer: { alignItems: 'center', marginTop: 100 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#3a3a3c', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  avatarText: { fontSize: 50, color: '#fff', fontWeight: 'bold' },
  name: { fontSize: 32, color: '#fff', fontWeight: '600' },
  status: { fontSize: 18, color: '#8e8e93', marginTop: 10 },
  bottomContainer: { marginBottom: 60, alignItems: 'center' },
  endButton: { width: 75, height: 75, borderRadius: 37.5, backgroundColor: '#ff3b30', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  buttonIcon: { color: '#fff', fontSize: 28 },
  buttonLabel: { color: '#fff', fontSize: 14, fontWeight: '500' }
});

export default OutgoingCallScreen;
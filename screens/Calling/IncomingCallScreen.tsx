import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import notifee from '@notifee/react-native';
import CallManageService from '../../services/calling/CallManageService';

const IncomingCallScreen = ({ route, navigation }: any) => {
  const { callId, callerName } = route.params;

  useEffect(() => {
    const unsubscribe = firestore().collection('calls').doc(callId)
      .onSnapshot(doc => {
        const data = doc.data();
        if (data && ['cancelled', 'missed', 'ended'].includes(data.status)) {
          console.log(`Incoming call ${callId} status changed to ${data?.status}. Closing screen.`);
          notifee.cancelNotification(callId);
          CallManageService.isBusy = false;
          navigation.goBack();
        }
      });
    return () => unsubscribe();
  }, [callId]);

  const onAnswer = async () => {
    try {
      // Final Check: Ensure call is still active before answer
      const callDoc = await firestore().collection('calls').doc(callId).get();
      const status = callDoc.data()?.status;
      if (status !== 'ringing' && status !== 'initiating') {
        console.warn(`Call cannot be answered. Current status: ${status}`);
        await notifee.cancelNotification(callId);
        await notifee.stopForegroundService();
        navigation.goBack();
        return;
      }

      await notifee.cancelNotification(callId);
      await firestore().collection('calls').doc(callId).update({ status: 'accepted' });
      // Navigate through the Screens stack (not a direct screen replace)
      navigation.replace('ActiveCallScreen', { callId, isCaller: false });
    } catch (e) {
      console.error("Answer Error:", e);
    }
  };

  const onDecline = async () => {
    try {
      CallManageService.isBusy = false;
      // Cancel the incoming notification AND stop any foreground service it may have created
      await notifee.cancelNotification(callId);
      await notifee.stopForegroundService();
      await firestore().collection('calls').doc(callId).update({ status: 'declined' });
      navigation.goBack();
    } catch (e) {
      console.error("Decline Error:", e);
      CallManageService.isBusy = false;
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topInfo}>
        <Text style={styles.incomingLabel}>INCOMING CALL</Text>
        <Text style={styles.name}>{callerName}</Text>
      </View>

      <View style={styles.actionRow}>
        <View style={styles.actionItem}>
          <TouchableOpacity onPress={onDecline} style={[styles.btn, { backgroundColor: '#ff3b30' }]}>
            <Text style={styles.icon}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Decline</Text>
        </View>

        <View style={styles.actionItem}>
          <TouchableOpacity onPress={onAnswer} style={[styles.btn, { backgroundColor: '#34c759' }]}>
            <Text style={styles.icon}>✓</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Accept</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between', paddingVertical: 80 },
  topInfo: { alignItems: 'center' },
  incomingLabel: { color: '#8e8e93', fontSize: 14, letterSpacing: 2, marginBottom: 10 },
  name: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  actionItem: { alignItems: 'center' },
  btn: { width: 75, height: 75, borderRadius: 37.5, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  icon: { color: '#fff', fontSize: 30 },
  label: { color: '#fff', fontSize: 16 }
});

export default IncomingCallScreen;
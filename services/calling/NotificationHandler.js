import notifee, { AndroidImportance, AndroidCategory, EventType } from '@notifee/react-native';
import axios from 'axios';
import firestore from '@react-native-firebase/firestore';

const baseUrl = 'https://push-notification-dvsr.onrender.com'; // Match this with CallManageService

// 1. Common Function to Display/Update Notification (Phase 3)
export const displayIncomingCall = async (data) => {
  const { callId, callerName } = data;
  
  const channelId = await notifee.createChannel({
    id: 'incoming-calls',
    name: 'Incoming Calls',
    importance: AndroidImportance.HIGH,
    sound: 'ringtone', 
    vibration: true,
  });

  await notifee.displayNotification({
    id: callId,
    title: 'Incoming Call',
    body: `${callerName} is calling...`,
    data: data, 
    android: {
      channelId,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: false, 
      color: '#34c759', 
      fullScreenAction: { 
        id: 'default', 
        mainComponent: 'IncomingCallScreen' 
      },
      actions: [
        { title: 'Answer', pressAction: { id: 'accept' } },
        { title: 'Decline', pressAction: { id: 'reject' } },
      ],
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
    },
  });

  // 40s Ringing Timer (Phase 3)
  // We keep a 40s timer to auto-cut if user doesn't respond
  setTimeout(async () => {
    try {
      const activeCall = await firestore().collection('calls').doc(callId).get();
      if (activeCall.exists && activeCall.data().status === 'ringing') {
        console.log(`Call ${callId} auto-cut: Missed Call (40s timer)`);
        await notifee.cancelNotification(callId);
        await firestore().collection('calls').doc(callId).update({ status: 'missed' });
        await showMissedCall(callerName);
      }
    } catch (e) {
      console.warn("Auto-cut timer error:", e);
    }
  }, 40000);
};

// 2. Convert to Ongoing Foreground Service (Phase 4)
export const convertToOngoingCall = async (callId, callerName) => {
  // First, cancel the ringing notification to stop the sound instantly
  await notifee.cancelNotification(callId);

  const channelId = await notifee.createChannel({
    id: 'ongoing-calls',
    name: 'Ongoing Calls',
    importance: AndroidImportance.LOW,
    vibration: false,
  });

  await notifee.displayNotification({
    id: callId,
    title: 'Ongoing Call',
    body: `In call with ${callerName || 'User'}`,
    data: { type: 'ongoing_call', callId: callId },
    android: {
      channelId: channelId,
      ongoing: true,
      asForegroundService: true,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [{ title: 'End Call', pressAction: { id: 'reject' } }],
    },
  });
};

// 3. Missed Call Helper
export const showMissedCall = async (callerName, callId) => {
  if (callId) await notifee.cancelNotification(callId);

  await notifee.displayNotification({
    title: 'Missed Call',
    body: `You missed a call from ${callerName}`,
    android: { 
      channelId: 'incoming-calls',
      importance: AndroidImportance.DEFAULT,
    },
  });
};

// 4. Main Logic Wrapper (Phase 3)
export const handleNotificationLogic = async (remoteMessage) => {
  if (!remoteMessage.data || !remoteMessage.data.callId) return;

  const { callId, callerName, initiationTimestamp } = remoteMessage.data;

  try {
    // Step A: Immediate Ack to Node.js (Phase 3)
    await axios.post(`${baseUrl}/call/confirm-receipt`, { callId })
      .catch(e => console.error("Ack Failed:", e.message));

    // Step B: Latency Validation (10s Rule - Phase 3)
    const initTime = parseInt(initiationTimestamp);
    const currentTime = Date.now();
    const delaySeconds = (currentTime - initTime) / 1000;

    console.log(`Call ${callId} Handshake: Delay ${delaySeconds}s`);

    if (delaySeconds > 10) {
      console.warn(`[Phase 3] Call ${callId} arrived late (${delaySeconds}s). Marking as missed.`);
      await firestore().collection('calls').doc(callId).update({ status: 'missed' });
      await showMissedCall(callerName);
      return;
    }

    // Step C: Concurrency Check (Phase 1)
    // If multiple notifications for same callId arrive, Notifee handles it via `id: callId`
    // If the receiver is already busy, the Backend should have blocked this request (Phase 2)

    // Step D: Show Full Screen Notification
    await displayIncomingCall(remoteMessage.data);
    
  } catch (error) {
    console.error("Notification Handler Logic Error:", error);
  }
};


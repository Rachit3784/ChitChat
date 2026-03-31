import notifee, { AndroidImportance, AndroidCategory, EventType } from '@notifee/react-native';
import axios from 'axios';
import firestore from '@react-native-firebase/firestore';
import CallLogService from './CallLogService';
const baseUrl = 'https://push-notification-dvsr.onrender.com'; // Match this with CallManageService
// const baseUrl = 'http://10.71.90.27:5221'
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
        { title: 'Answer', pressAction: { id: 'accept', launchActivity: 'default' } },
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

        // Local Log for Auto-Cut
        CallLogService.saveCallLog({
          id: callId,
          contactUid: activeCall.data().callerUid,
          contactName: activeCall.data().callerName || 'Unknown',
          contactPhoto: activeCall.data().callerPhoto || null,
          callType: activeCall.data().callType || 'audio',
          direction: 'incoming',
          status: 'missed',
          startedAt: Date.now(),
          duration: 0
        });

        await firestore().collection('calls').doc(callId).update({ status: 'missed' });
        await showMissedCall(callerName, callId);
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
    // Include callId so pressing the notification can navigate back to the call
    data: { type: 'ongoing_call', callId: callId },
    android: {
      channelId: channelId,
      ongoing: true,
      asForegroundService: true,
      // launchActivity: 'default' ensures the app is brought to foreground
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [{ title: 'End Call', pressAction: { id: 'end_call', launchActivity: 'default' } }],
    },
  });
};

// 2b. Caller-side: Convert Outgoing Notification → Ongoing (when receiver accepts)
export const convertOutgoingToOngoing = async (callId, receiverName) => {
  // Cancel the outgoing notification (outgoing_ prefix)
  await notifee.cancelNotification(`outgoing_${callId}`);

  const channelId = await notifee.createChannel({
    id: 'ongoing-calls',
    name: 'Ongoing Calls',
    importance: AndroidImportance.LOW,
    vibration: false,
  });

  // Create the standard ongoing notification with the plain callId
  // so the same logic works for both caller and receiver in App.tsx, index.js
  await notifee.displayNotification({
    id: callId,
    title: '\uD83D\uDCF5 Call Connected',
    body: `In call with ${receiverName || 'User'}`,
    data: { type: 'ongoing_call', callId: callId, isCaller: 'true' },
    android: {
      channelId,
      ongoing: true,
      asForegroundService: true,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [{ title: 'End Call', pressAction: { id: 'end_call', launchActivity: 'default' } }],
    },
  });
};

// 3. Missed Call Helper
export const showMissedCall = async (callerName, callId) => {
  if (callId) await notifee.cancelNotification(callId);

  await notifee.displayNotification({
    title: 'Missed Call',
    body: `You missed a call from ${callerName}`,
    data: { type: 'missed_call' },
    android: {
      channelId: 'incoming-calls',
      importance: AndroidImportance.DEFAULT,
    },
  });
};

// 5. Display Outgoing Call Notification (lets caller track call from background/kill mode)
// Uses asForegroundService so the JS thread stays alive and Firestore listeners keep running.
export const displayOutgoingCall = async (callId, receiverName, receiverPhoto = null) => {
  const channelId = await notifee.createChannel({
    id: 'outgoing-calls',
    name: 'Outgoing Calls',
    importance: AndroidImportance.HIGH,
    vibration: false,
  });

  await notifee.displayNotification({
    id: `outgoing_${callId}`,
    title: '\uD83D\uDCDE Calling...',
    body: `Calling ${receiverName || 'User'}...`,
    data: { type: 'outgoing_call', callId, receiverName: receiverName || 'User' },
    android: {
      channelId,
      ongoing: true,
      asForegroundService: true, // Keeps JS thread alive so Firestore listeners work
      autoCancel: false,
      color: '#34c759',
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: '\uD83D\uDCF5 End Call', pressAction: { id: 'end_outgoing_call', launchActivity: 'default' } },
      ],
    },
  });
};

// 6. Show a brief auto-dismissing status notification to the caller (declined / unavailable)
export const showCallStatusNotification = async (callId, statusType, receiverName) => {
  const channelId = await notifee.createChannel({
    id: 'call-status',
    name: 'Call Status',
    importance: AndroidImportance.DEFAULT,
    vibration: false,
  });

  const configs = {
    declined: {
      title: '\uD83D\uDCF5 Call Declined',
      body: `${receiverName || 'User'} declined your call`,
    },
    unavailable: {
      title: '\u274C Not Available',
      body: `${receiverName || 'User'} is currently unavailable`,
    },
  };

  const cfg = configs[statusType];
  if (!cfg) return;

  await notifee.displayNotification({
    id: `status_${callId}`,
    title: cfg.title,
    body: cfg.body,
    // type:'call_status' tells App.tsx to navigate to Call History, not IncomingCallScreen
    data: { type: 'call_status', navigateTo: 'CallHistory' },
    android: {
      channelId,
      autoCancel: true,
      timeoutAfter: 6000, // Auto-dismiss after 6 seconds
      pressAction: { id: 'default', launchActivity: 'default' },
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

    // Step B: Live Re-Sync (Keep eye on call status - Phase 3)
    const unsubscribe = firestore().collection('calls').doc(callId).onSnapshot(doc => {
      if (!doc.exists) return;
      const status = doc.data()?.status;
      if (['ended', 'cancelled', 'declined', 'missed'].includes(status)) {
        console.log(`[NotificationHandler] Call ${callId} ${status} - Dismissing UI.`);
        notifee.cancelNotification(callId);

        // Only save a call log for missed/cancelled/declined from the notification side.
        // 'ended' is already handled by ActiveCallScreen to avoid duplicate log entries.
        if (['cancelled', 'declined', 'missed'].includes(status)) {
          try {
            const notificationData = remoteMessage.data || {};
            // Safe fallback for all fields – FCM payload field names can vary
            const contactUid = notificationData.callerUid
              || notificationData.callerId
              || 'unknown';
            CallLogService.saveCallLog({
              id: callId,
              contactUid,
              contactName: notificationData.callerName || 'User',
              contactPhoto: notificationData.callerPhoto || null,
              callType: notificationData.callType || notificationData.type || 'audio',
              direction: 'incoming',
              status: status === 'cancelled' ? 'missed' : status,
              startedAt: Date.now(),
              duration: 0
            });
          } catch (logErr) {
            console.warn('[NotificationHandler] Call log save failed:', logErr);
          }
        }

        unsubscribe(); // Stop watching
      }
    });

    // Step C: Latency Validation (10s Rule - Phase 3)
    const initTime = parseInt(initiationTimestamp);
    const currentTime = Date.now();
    const delaySeconds = (currentTime - initTime) / 1000;

    console.log(`Call ${callId} Handshake: Delay ${delaySeconds}s`);

    // Allow up to 30s window – kill-mode startup + JS bundle load can take 10-20s
    if (delaySeconds > 30) {
      console.warn(`[Phase 3] Call ${callId} arrived too late (${delaySeconds}s). Marking as missed.`);
      await firestore().collection('calls').doc(callId).update({ status: 'missed' });
      await showMissedCall(callerName, callId);
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


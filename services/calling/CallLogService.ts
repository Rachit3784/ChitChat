/**
 * CallLogService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages call history logs — reads/writes from SQLite + syncs with Firestore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import firestore from '@react-native-firebase/firestore';
import LocalDBService from '../../localDB/LocalDBService';
import type { CallLog } from '../../localDB/LocalDBService';

export type { CallLog };

class CallLogService {
  /**
   * Save a call log to SQLite immediately after call ends.
   */
  saveCallLog(log: CallLog): void {
    LocalDBService.saveCallLog(log);
  }

  /**
   * Get all call logs from SQLite (sorted by date descending).
   */
  getCallLogs(limit: number = 100): CallLog[] {
    return LocalDBService.getCallLogs(limit);
  }

  /**
   * Get missed call count (for badge).
   */
  getMissedCallCount(): number {
    return LocalDBService.getMissedCallCount();
  }

  /**
   * Clear all call logs.
   */
  clearCallLogs(): void {
    LocalDBService.clearCallLogs();
  }

  deleteLogs(ids: string[]): void {
    LocalDBService.deleteCallLogs(ids);
  }

  /**
   * Sync call logs from Firestore to local SQLite.
   * Fetches last 50 calls involving this user.
   */
  async syncFromFirestore(myUid: string): Promise<void> {
    try {
      // Calls where I was the caller
      const asCallerSnap = await firestore()
        .collection('calls')
        .where('callerId', '==', myUid)
        .orderBy('initiationTimestamp', 'desc')
        .limit(50)
        .get();

      // Calls where I was the receiver
      const asReceiverSnap = await firestore()
        .collection('calls')
        .where('receiverId', '==', myUid)
        .orderBy('initiationTimestamp', 'desc')
        .limit(50)
        .get();

      const allDocs = [...asCallerSnap.docs, ...asReceiverSnap.docs];

      for (const doc of allDocs) {
        const data = doc.data();
        const isMeCaller = data.callerId === myUid;

        const log: CallLog = {
          id: doc.id,
          contactUid: isMeCaller ? data.receiverId : data.callerId,
          contactName: isMeCaller ? (data.receiverName || 'User') : (data.callerName || 'User'),
          contactPhoto: isMeCaller ? (data.receiverPhoto || null) : (data.callerPhoto || null),
          callType: data.type || 'audio',
          direction: isMeCaller ? 'outgoing' : 'incoming',
          status: this.mapFirestoreStatus(data.status, isMeCaller),
          startedAt: data.initiationTimestamp || Date.now(),
          duration: data.duration || 0,
        };

        LocalDBService.saveCallLog(log);
      }

      console.log('[CallLogService] Synced', allDocs.length, 'call logs from Firestore.');
    } catch (error) {
      console.error('[CallLogService] Sync error:', error);
    }
  }

  private mapFirestoreStatus(
    status: string,
    isCaller: boolean,
  ): 'completed' | 'missed' | 'declined' {
    switch (status) {
      case 'ended': return 'completed';
      case 'declined': return 'declined';
      case 'missed': return 'missed';
      case 'ringing':
      case 'accepted':
        // If still ringing/accepted somehow, treat as missed
        return isCaller ? 'missed' : 'missed';
      default: return 'completed';
    }
  }

  /**
   * Format duration (seconds) → human readable string (e.g., "2:45")
   */
  formatDuration(seconds: number): string {
    if (seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

export default new CallLogService();

import database from '@react-native-firebase/database';
import firestore from '@react-native-firebase/firestore';
import { AppState, AppStateStatus } from 'react-native';

class PresenceService {
  private uid: string | null = null;
  private appStateSubscription: any = null;

  public initialize(uid: string) {
    this.uid = uid;
    
    // 1. Reference to the user's presence node in RTDB
    const userStatusDatabaseRef = database().ref(`/presence/${uid}`);

    // 2. We'll set these status objects when we go online/offline
    const isOfflineForDatabase = {
      state: 'offline',
      last_changed: database.ServerValue.TIMESTAMP,
    };

    const isOnlineForDatabase = {
      state: 'online',
      last_changed: database.ServerValue.TIMESTAMP,
    };

    // 3. Listen to RTDB connection state
    database().ref('.info/connected').on('value', (snapshot) => {
      if (snapshot.val() === false) {
        // If we're not connected, we can't do anything
        return;
      }

      // If we are connected, set up the onDisconnect hook so that
      // if we lose connection (app killed, network drop), it writes `isOfflineForDatabase`
      userStatusDatabaseRef.onDisconnect().set(isOfflineForDatabase).then(() => {
        // Only after setting the onDisconnect hook, we write that we are online
        userStatusDatabaseRef.set(isOnlineForDatabase);
        
        // Also update Firestore (informative)
        firestore().collection('users').doc(uid).update({ availability: 'online' }).catch(() => {});
      });
    });

    // 4. Handle App Background/Foreground state
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (!this.uid) return;
    const userStatusDatabaseRef = database().ref(`/presence/${this.uid}`);
    
    if (nextAppState === 'active') {
      userStatusDatabaseRef.set({
        state: 'online',
        last_changed: database.ServerValue.TIMESTAMP,
      });
      firestore().collection('users').doc(this.uid).update({ availability: 'online' }).catch(() => {});
    } else if (nextAppState === 'background') {
      // Background meaning they aren't looking at the screen, but app is alive
      userStatusDatabaseRef.set({
        state: 'available', // available means push notifications work
        last_changed: database.ServerValue.TIMESTAMP,
      });
      firestore().collection('users').doc(this.uid).update({ availability: 'available' }).catch(() => {});
    }
  };

  public cleanup() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.uid) {
      database().ref(`/presence/${this.uid}`).set({
        state: 'offline',
        last_changed: database.ServerValue.TIMESTAMP,
      });
      this.uid = null;
    }
  }

  // Helper for checks:
  public async getUserPresence(uid: string): Promise<string> {
    try {
      const snap = await database().ref(`/presence/${uid}`).once('value');
      return snap.val()?.state || 'offline';
    } catch {
      return 'offline';
    }
  }
}

export default new PresenceService();

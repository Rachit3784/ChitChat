import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import firestore from '@react-native-firebase/firestore';
import NotificationService from '../services/NotificationService';

const SECURE_STORE_KEY = 'userToken';

const saveToken = async (token) => {  if (token) {
    await Keychain.setGenericPassword(SECURE_STORE_KEY, token, {
      service: SECURE_STORE_KEY,
    });
  }
};



const deleteToken = async () => {
        await Keychain.resetGenericPassword({ service: SECURE_STORE_KEY });
};




const getToken = async () => {
  try {
    const credentials = await Keychain.getGenericPassword({ service: SECURE_STORE_KEY });
    return credentials ? credentials.password : null;
  } catch (error) {
    console.error("Keychain retrieval failed:", error);
    return null;
  }
};




const userStore = create(
  persist(
    (set, get) => ({
      userName: null,
      token: null,
      userEmailID: null,
      userModelID: null,
      userPhoto: null,
      isBusy: false,
      keyUpdatedAt: 0, // 0 means not set or first time
      setUserModelID: (id) => set({ userModelID: id }),
      setUserName: (name) => set({ userName: name }),
      setUserPhoto: (photo) => set({ userPhoto: photo }),
      setIsBusy: (busy) => set({ isBusy: busy }),
      setKeyUpdatedAt: (time) => set({ keyUpdatedAt: time }),

      userData: null,
      gender: null,
      userProfileData: null,
      isUploading: false,
      currentProfileUrl: '',
      userMobileNum: null,

      firebaseUserUpdate: async (user, token, userData = null, persistToken = false) => {
        try {
          if (persistToken && token) {
            await saveToken(token);
          }
          const mergedData = { ...user, ...userData };

          set((state) => ({
            ...state,
            userName: mergedData.username || mergedData.displayName,
            userEmailID: mergedData.email,
            userModelID: user.uid,
            userMobileNum: mergedData.mobileNumber,
            userData: mergedData,
            token: token || state.token,
            keyUpdatedAt: mergedData.keyUpdatedAt || state.keyUpdatedAt || 0,
          }));
          return { success: true };
        } catch (error) {
          console.error("firebaseUserUpdate Error:", error);
          return { success: false };
        }
      },

      saveSessionToken: async (token) => {
        if (token) {
          await saveToken(token);
          set({ token });
          return true;
        }
        return false;
      },

      logout: async () => {
        const { userModelID } = get();

        // 1. Clear Firebase user document tokens & public key
        try {
          if (userModelID) {
            await NotificationService.clearFCMToken(userModelID);
            await firestore().collection('users').doc(userModelID).set({ 
               userIdFCMtoken: null,
               lastDeviceToken: null,
               sessionToken: null,
               tokenUpdatedAt: null,
               // Do NOT wipe publicKey — other users may still need it to decrypt past messages
               // publicKey stays; it's public information
            }, { merge: true }).catch(() => {});
          }
        } catch (e) { console.warn('Firestore cleanup failed:', e); }

        // 2. Firebase Auth sign out
        try {
          const auth = require('@react-native-firebase/auth').default;
          await auth().signOut();
        } catch (authError) {
          console.error("Firebase signOut failed:", authError);
        }

        // 3. SQLite — drop & recreate all tables
        try {
          const LocalDB = require('../localDB/LocalDBService').default;
          LocalDB.clearAllData();
        } catch (dbError) {
          console.error("SQLite clear failed:", dbError);
        }

        // 4. Keychain — main session token
        await deleteToken();

        // 5. Keychain — E2EE private key
        try {
          await Keychain.resetGenericPassword({ service: 'secure_chat_private_key' });
          console.log('[Logout] E2EE private key cleared from Keychain.');
        } catch (keyErr) {
          console.warn('[Logout] E2EE key clear failed:', keyErr);
        }

        // 6. Zustand state reset
        set({ 
          userName: null, 
          token: null, 
          userModelID: null, 
          userData: null,
          userEmailID: null,
          userMobileNum: null,
          userProfileData: null,
          currentProfileUrl: '',
          gender: null,
          keyUpdatedAt: 0,
        });

        // 7. AsyncStorage — wipe everything
        try {
          await AsyncStorage.clear();
          console.log('[Logout] AsyncStorage cleared.');
        } catch (storageError) {
          console.error("AsyncStorage clear failed:", storageError);
          await AsyncStorage.removeItem('chitchat-user-store');
        }

        console.log('[Logout] Complete — device is clean.');
      },

      loadUserFromStorage: async () => {
        try {
          const token = await getToken();
          if (!token) return false;
          set({ token });
          return true;
        } catch (error) {
          console.error('LoadUserFromStorage Error:', error);
          return false;
        }
      },
    }),
    {
      name: 'chitchat-user-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        userName: state.userName,
        userEmailID: state.userEmailID,
        userModelID: state.userModelID,
        userData: state.userData,
        gender: state.gender,
        userProfileData: state.userProfileData,
        currentProfileUrl: state.currentProfileUrl,
        userMobileNum: state.userMobileNum,
        keyUpdatedAt: state.keyUpdatedAt,
      }),
    }
  )
);

export default userStore;




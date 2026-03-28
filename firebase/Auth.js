import { Alert } from "react-native";
import userStore from "../store/MyStore";

import { GoogleSignin, auth , firestore} from "./config";




export const loginWithGoogle = async () => {
  try {
    try { await GoogleSignin.signOut(); } catch (e) { }
    await GoogleSignin.hasPlayServices();

    const response = await GoogleSignin.signIn();
    const idToken = response?.data?.idToken || response?.idToken;
    if (!idToken) throw new Error("No idToken returned from Google");

    const googleCredential = auth.GoogleAuthProvider.credential(idToken);
    const userCredential = await auth().signInWithCredential(googleCredential);
    const user = userCredential.user;

    let userData = null;
    let isNewUser = false;

    
    try {
      const userDoc = await firestore().collection('users').doc(user.uid).get();
      
      if (!userDoc.exists) {
        isNewUser = true;
        userData = {
          uid: user.uid,
          name: user.displayName || '',
          email: user.email || '',
          photo: user.photoURL || '',
          mobileNumber: '',
          username: '',
          verified: false,
          lastDeviceToken: null, // Initially null
          createdAt: new Date(),
          lastLogin: new Date(),
        };
        await firestore().collection('users').doc(user.uid).set(userData);

      } else {
        const existingData = userDoc.data() || {};
        userData = { 
          uid: user.uid,
          name: existingData.name || user.displayName || '',
          photo: existingData.photo || user.photoURL || '',
          ...existingData 
        };
        
        await firestore().collection('users').doc(user.uid).set({
          lastLogin: new Date(),
        }, { merge: true });

      }

    } catch (fsError) {
      console.error("[Auth] Firestore Error:", fsError);
      Alert.alert("Firestore Sync Failed", fsError.message || "Please check your internet connection.");
      return { success: false, error: fsError.message };
    }

    if (!userData) {
      return { success: false, error: "Cloud profile not found." };
    }



    // Call update but DON'T persist token to Keychain yet if profile incomplete
    const profileComplete = userData.username && userData.mobileNumber && userData.verified;
    await userStore.getState().firebaseUserUpdate(user, idToken, userData, profileComplete);

    return { success: true, user, idToken, isNewUser, userData };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const validateSession = async (uid) => {
  try {
    const userDoc = await firestore().collection('users').doc(uid).get();
    if (!userDoc.exists) return null;

    const data = userDoc.data();
    const { token: localToken } = userStore.getState();



    // Single Device Enforcement: Check Last Device Token
    if (data.lastDeviceToken && data.lastDeviceToken !== localToken) {
       return "SESSION_EXPIRED";
    }



    return data;
  } catch (error) {
    return null;
  }
};

export const updateUserProfile = async (uid, profileData, token = null) => {
  try {
    // Remove Device Info usage as requested
    let deviceId = "REMOVED";

    const updatePayload = {
      ...profileData,
      updatedAt: new Date(),
    };

    if (token) {
      updatePayload.lastDeviceToken = token;
      updatePayload.sessionToken = token; // Keep sessionToken for the enforce check
    }

    await firestore().collection('users').doc(uid).set(updatePayload, { merge: true });

    return true;
  } catch (error) {
    console.error("[Auth] updateUserProfile Error:", error);
    Alert.alert("updateUserProfile Error", `Message: ${error.message}\nCode: ${error.code}`);
    return false;
  }
};



export const checkMobileNumberExists = async (num, currentUid = "") => {
  const s = await firestore().collection('users').where('mobileNumber', '==', num).get();
  if (s.empty) return false;
  // If it exists, check if it's someone else's
  if (currentUid) {
    const otherUser = s.docs.find(doc => doc.id !== currentUid);
    return !!otherUser;
  }
  return true;
};

export const checkUsernameExists = async (un, currentUid = "") => {
  const s = await firestore().collection('users').where('username', '==', un.toLowerCase()).get();
  if (s.empty) return false;
  // If it exists, check if it's someone else's
  if (currentUid) {
    const otherUser = s.docs.find(doc => doc.id !== currentUid);
    return !!otherUser;
  }
  return true;
};





export const getUserData = async (uid) => {
  try {
    const userDoc = await firestore().collection('users').doc(uid).get();
    return userDoc.exists ? userDoc.data() : null;
  } catch (error) {
    console.error("Get User Data Error:", error);
    return null;
  }
};

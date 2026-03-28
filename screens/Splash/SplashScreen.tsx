import React, { useEffect, useContext } from "react";
import { View, Dimensions, StyleSheet, Alert } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";

import { getUserData, validateSession } from "../../firebase/Auth";

import auth from '@react-native-firebase/auth';
import userStore from "../../store/MyStore";


const { width, height } = Dimensions.get("window");

// Animation durations
const LOGO_HALF_DURATION = 800;   // 0 → 0.5
const LOGO_END_DURATION = 1500;    // 0.5 → 1
const BG_DURATION = 1000;         // background expand

const SplashScreen = () => {
  const navigation = useNavigation();


  const logoScale = useSharedValue(0);
  const bgScale = useSharedValue(0);

  const goNext = async () => {
    const { loadUserFromStorage, logout } = userStore.getState();
    const hasToken = await loadUserFromStorage();
    const currentUser = auth().currentUser;
    const netState = await NetInfo.fetch();
    const isOnline = !!netState.isConnected;
    
    if (hasToken && currentUser) {
      if (isOnline) {
        // 1. Fetch Latest User Data from Firestore
        const userData = await getUserData(currentUser.uid);
        
        if (userData) {
          // 2. Validate Session (Single Device Check)
          const sessionStatus = await validateSession(currentUser.uid);
          
          if (sessionStatus === "SESSION_EXPIRED") {
            Alert.alert("Session Expired", "Aapka account dusre device par login ho gaya hai. Phir se login karein.");
            await logout();
            await auth().signOut();
            (navigation as any).reset({ index: 0, routes: [{ name: 'Auth' }] });
            return;
          }

          // 3. Check Profile Completion
          const isProfileComplete = userData.verified && userData.username && userData.mobileNumber;
          if (isProfileComplete) {
            (navigation as any).reset({ index: 0, routes: [{ name: 'Main' }] });
          } else {
            (navigation as any).reset({ index: 0, routes: [{ name: 'Auth' }] });
          }
        } else {
          await logout();
          (navigation as any).reset({ index: 0, routes: [{ name: 'Auth' }] });
        }
      } else {
        // Offline: Proceed to main app if local session exists, 
        // RootNavigator will handle validation once online.
        (navigation as any).reset({ index: 0, routes: [{ name: 'Main' }] });
      }
    } else {
      (navigation as any).reset({ index: 0, routes: [{ name: 'Auth' }] });
    }
  };



  useEffect(() => {
    // --- LOGO ANIMATION ---
    logoScale.value = withSequence(
      withTiming(0.5, {
        duration: LOGO_HALF_DURATION,
        easing: Easing.out(Easing.cubic),
      }),
      withTiming(1, {
        duration: LOGO_END_DURATION,
        easing: Easing.out(Easing.cubic),
      })
    );

    // --- BACKGROUND EXPANDS AFTER LOGO REACHES 50% ---
    setTimeout(() => {
      bgScale.value = withTiming(1, {
        duration: BG_DURATION,
        easing: Easing.out(Easing.exp),
      });
    }, LOGO_HALF_DURATION);

    // --- NAVIGATE AFTER ALL ANIMATIONS COMPLETE ---
    const totalTime =
      LOGO_HALF_DURATION + LOGO_END_DURATION + BG_DURATION + 150;

    const timer = setTimeout(() => {
      goNext();
    }, totalTime);

    return () => clearTimeout(timer);
  }, []);

  // --- Animated Styles ---
  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  const bgAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bgScale.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Background expanding circle */}
      <Animated.View style={[styles.bgCircle, bgAnimatedStyle]} />

      {/* Logo */}
      <Animated.Image
        source={require("./logo.png")}
        style={[styles.logo, logoAnimatedStyle]}
        resizeMode="contain"
      />
    </View>
  );
};

export default SplashScreen;

const SIZE = Math.max(width, height) * 1.4;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  bgCircle: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: "#FACC15", // yellow
    transform: [{ scale: 0 }],
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius :  80,
    transform: [{ scale: 0 }],
  },
});

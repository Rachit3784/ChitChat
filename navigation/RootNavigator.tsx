import React, { useEffect, useState, useRef } from 'react';
import { Alert, View, Text, StyleSheet, Animated } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import NetInfo from "@react-native-community/netinfo";
import auth from '@react-native-firebase/auth';

import AuthNavigation from './AuthNavigation';
import MainNavigation from './MainNavigation';
import SplashScreen from '../screens/Splash/SplashScreen';
import ScreensNavigation from './ScreensNavigation';
import IncomingCallOverlay from '../components/calling/IncomingCallOverlay';
import userStore from '../store/MyStore'; 
import { validateSession } from '../firebase/Auth';

const Stack = createNativeStackNavigator();

const RootNavigator = ({ navigation }: any) => {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(100)).current; // Start off-screen
  const prevConnected = useRef<boolean | null>(null);

  const showOfflineBar = () => {
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(2000),
      Animated.timing(slideAnim, {
        toValue: 100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const connected = !!state.isConnected;
      const currentUser = auth().currentUser;

      // Handle Offline -> Online Transition
      if (prevConnected.current === false && connected === true) {
        if (currentUser) {
          try {
            const status = await validateSession(currentUser.uid);
            if (status === "SESSION_EXPIRED") {
              Alert.alert("Session Expired", "Aapka account dusre device par active ho gaya hai. Phir se login karein.");
              await userStore.getState().logout(); 
              await auth().signOut();
              if (navigation) navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
            }
          } catch (e) {}
        }
      }

      // Handle Online -> Offline Transition
      if (connected === false && (prevConnected.current === true || prevConnected.current === null)) {
        setIsOffline(true);
        showOfflineBar();
      } else if (connected === true) {
        setIsOffline(false);
      }

      prevConnected.current = connected;
    });

    return () => unsubscribe();
  }, [navigation]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name='Splash' component={SplashScreen} />
        <Stack.Screen name='Main' component={MainNavigation} /> 
        <Stack.Screen name='Auth' component={AuthNavigation} />
        <Stack.Screen name='Screens' component={ScreensNavigation} />
      </Stack.Navigator>

      {/* Offline Bottom Bar */}
      <Animated.View style={[styles.offlineBar, { transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.offlineText}>You are currently offline</Text>
      </Animated.View>

      {/* Global Incoming Call Overlay — renders above all screens */}
      <IncomingCallOverlay />
    </View>
  );
};

const styles = StyleSheet.create({
  offlineBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF5252',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  offlineText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default RootNavigator;
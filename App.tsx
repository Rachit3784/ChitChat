import React from "react";
import { StatusBar, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import RootNavigator from "./navigation/RootNavigator";

import { NavigationContainer } from "@react-navigation/native";
import database from '@react-native-firebase/database';

database().setPersistenceEnabled(true);

import 'react-native-reanimated';
import { navigationRef } from "./services/NavigationService";

export default function App() {
  const isDark = useColorScheme() === "dark";

  return (
  
      <SafeAreaProvider>

      <StatusBar 
        barStyle={isDark ? "light-content" : "dark-content"} 
        backgroundColor="transparent"
        translucent
      />

      <NavigationContainer ref={navigationRef}>
        <RootNavigator/>
      </NavigationContainer>

    </SafeAreaProvider>
    
  );
}

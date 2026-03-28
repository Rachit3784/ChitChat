import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UserListScreen from '../screens/Main/NoTabs/UserListScreen';
import ChatScreen from '../screens/Main/NoTabs/ChatScreen';
import OutgoingCallScreen from '../screens/Calling/OutgoingCallScreen';
import IncomingCallScreen from '../screens/Calling/IncomingCallScreen';
import ActiveCallScreen from '../screens/Calling/ActiveCallScreen';
import CreateStatusScreen from '../screens/Main/NoTabs/CreateStatusScreen';
import StatusViewerScreen from '../screens/Main/NoTabs/StatusViewerScreen';
import StatusInsightsScreen from '../screens/Main/NoTabs/StatusInsightsScreen';

const Stack = createNativeStackNavigator();

const ScreensNavigation = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="UserListScreen" component={UserListScreen} />
      <Stack.Screen name="ChatScreen" component={ChatScreen} />
      {/* ── Calling Screens ── */}
      <Stack.Screen
        name="OutgoingCallScreen"
        component={OutgoingCallScreen}
        options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen
        name="IncomingCallScreen"
        component={IncomingCallScreen}
        options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen
        name="ActiveCallScreen"
        component={ActiveCallScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      {/* ── Status Screens ── */}
      <Stack.Screen
        name="CreateStatusScreen"
        component={CreateStatusScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="StatusViewerScreen"
        component={StatusViewerScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen
        name="StatusInsightsScreen"
        component={StatusInsightsScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
};

export default ScreensNavigation;
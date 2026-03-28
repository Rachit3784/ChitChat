import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import SignupScreen from '../screens/Auth/SignupScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import OtpScreen from '../screens/Auth/OtpScreen';
import InterestsScreen from '../screens/Auth/Interest';
import WelcomeScreen from '../screens/Auth/IntroScreen';
import ProfileSetupScreen from '../screens/Auth/ProfileSetupScreen';
import AboutUsScreen from '../screens/Auth/AboutScreen';

const Stack = createNativeStackNavigator();

const AuthNavigation = () => {
  return (
    <Stack.Navigator >
      <Stack.Screen name='WelcomeScreen' component={WelcomeScreen} options={{headerShown : false}} />
      <Stack.Screen name='Signup' component={SignupScreen} options={{headerShown : false}}/>
      <Stack.Screen name='login' component={LoginScreen} options={{headerShown : false}} />
      <Stack.Screen name='OTP' component={OtpScreen} options={{headerShown : false}} />
      <Stack.Screen name='Interest' component={InterestsScreen} options={{headerShown : false}} />
      <Stack.Screen name='ProfileSetup' component={ProfileSetupScreen} options={{headerShown : false}} />
              <Stack.Screen name='AboutUsScreen' component={AboutUsScreen} options={{headerShown : false} } />
    </Stack.Navigator>
  )
}

export default AuthNavigation
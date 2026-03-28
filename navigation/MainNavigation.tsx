
import React from 'react'

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import CustomTabBar from '../components/CustomTabs'
import HomeScreen from '../screens/Main/Tabs/HomeScreen'
import ProfileScreen from '../screens/Main/Tabs/ProfileScreen'
import StatusScreen from '../screens/Main/Tabs/StatusScreen'
import CallScreen from '../screens/Main/Tabs/CallScreen'




const Tabs = createBottomTabNavigator()

const MainNavigation = () => {
  return (
     <Tabs.Navigator 
     tabBar={(props) => <CustomTabBar {...props} />} 
      screenOptions={{ headerShown: false }}

     >
    <Tabs.Screen name='Home'  component = {HomeScreen} options={{headerShown : false}}/>
         <Tabs.Screen name='Status'  component = {StatusScreen} options={{headerShown : false}}/>
           <Tabs.Screen name='Call'  component = {CallScreen} options={{headerShown : false}}/>
                      <Tabs.Screen name='Profile'  component = {ProfileScreen} options={{headerShown : false}}/>
   </Tabs.Navigator>
  )
}

export default MainNavigation
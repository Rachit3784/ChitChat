import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, 
  TextInput, Alert, ActivityIndicator, ScrollView, Image, BackHandler, StatusBar, Platform
} from 'react-native';
import { Camera, ChevronDown } from 'lucide-react-native';

import { updateUserProfile, checkMobileNumberExists, checkUsernameExists } from '../../firebase/Auth';
import auth from '@react-native-firebase/auth';
import userStore from '../../store/MyStore';
import EncryptionService from '../../services/chat/EncryptionService';

const G = {
  BG: '#0A0A0A',
  GOLD: '#F5C518',
  GLASS: 'rgba(255,255,255,0.07)',
  GLASS_BORDER: 'rgba(255,255,255,0.12)',
  TEXT: '#FFFFFF',
  TEXT_SEC: 'rgba(255,255,255,0.55)',
  SEPARATOR: 'rgba(255,255,255,0.07)',
};

export default function ProfileSetupScreen({ navigation, route }: any) {
  const { userData, isNewUser, idToken } = route?.params || {};
  
  const [selectedCountry, setSelectedCountry] = useState({ code: '+91', flag: '🇮🇳' });
  const [fullName, setFullName] = useState(userData?.name || '');
  const [username, setUsername] = useState(userData?.username || '');
  const [mobileNumber, setMobileNumber] = useState(userData?.mobileNumber ? userData.mobileNumber.replace('+91', '') : '');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const backAction = () => {
      Alert.alert("Wait!", "Please complete your profile setup to continue.");
      return true;
    };
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  const handleContinue = async () => {
    if (!fullName.trim() || !username.trim() || mobileNumber.length < 10) {
      Alert.alert('Error', 'Full Name, Username, and a valid 10-digit Mobile Number are required.');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) throw new Error('Auth session missing');

      const uExists = await checkUsernameExists(username.trim(), currentUser.uid);
      if (uExists) {
        Alert.alert('Error', 'Username already taken. Try another one.');
        setLoading(false);
        return;
      }

      const fullMobile = `${selectedCountry.code}${mobileNumber.trim()}`;
      const mExists = await checkMobileNumberExists(fullMobile, currentUser.uid);
      if (mExists) {
        Alert.alert('Error', 'Mobile number already registered by another account.');
        setLoading(false);
        return;
      }

      const updatedData = {
        name: fullName.trim(),
        username: username.trim().toLowerCase(),
        mobileNumber: fullMobile,
        email: currentUser.email || userData?.email || '', 
        verified: true,
        photo: userData?.photo || currentUser.photoURL || null,
        keyUpdatedAt: 0, 
      };

      const success = await updateUserProfile(currentUser.uid, updatedData, idToken);

      if (success) {
        try {
          console.log('[ProfileSetupScreen] Initializing E2EE Keys...');
          const result = await EncryptionService.generateAndStoreKeyPair(currentUser.uid);
          updatedData.keyUpdatedAt = result.keyUpdatedAt; 
        } catch (keyError) {
          console.error('Key generation failed during signup:', keyError);
        }

        if (idToken) {
          await userStore.getState().saveSessionToken(idToken);
        }
        await userStore.getState().firebaseUserUpdate(currentUser, idToken, updatedData, true);
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else {
        Alert.alert('Error', 'Failed to save profile. Check internet.');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={G.BG} />
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profile Setup</Text>
          <Text style={styles.subtitle}>
            {isNewUser ? "Welcome! Let's get you started." : "Please complete your profile details."}
          </Text>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.imageWrapper}>
            <Image
              source={userData?.photo ? { uri: userData.photo } : require('../../asset/UserLogo.png')}
              style={styles.profileImage}
            />
            <View style={styles.cameraBadge}>
              <Camera size={14} color="#000" />
            </View>
          </View>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your Name"
              placeholderTextColor={G.TEXT_SEC}
              editable={true}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={[
                styles.input, 
                userData?.username && { opacity: 0.6 }
              ]}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              editable={!userData?.username}
              placeholder="unique_username"
              placeholderTextColor={G.TEXT_SEC}
            />
            {userData?.username && (
              <Text style={styles.infoText}>Username cannot be changed once set.</Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mobile Number</Text>
            <View style={styles.phoneInputContainer}>
              <TouchableOpacity 
                style={styles.countryPicker}
                onPress={() => Alert.alert("Select Country", "Country selection coming soon")}
                disabled={!!userData?.mobileNumber}
              >
                <Text style={styles.flag}>{selectedCountry.flag}</Text>
                <Text style={styles.countryCode}>{selectedCountry.code}</Text>
                {!userData?.mobileNumber && <ChevronDown size={14} color={G.TEXT_SEC} />}
              </TouchableOpacity>
              <TextInput
                style={styles.phoneInput}
                value={mobileNumber}
                onChangeText={setMobileNumber}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!userData?.mobileNumber}
                placeholder="10 digit number"
                placeholderTextColor={G.TEXT_SEC}
              />
            </View>
            {userData?.mobileNumber && (
              <Text style={styles.infoText}>Mobile number cannot be changed once set.</Text>
            )}
          </View>

          <TouchableOpacity 
            style={styles.btn} 
            onPress={handleContinue}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.btnText}>Start Chatting</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: G.BG },
  scrollContent: { flexGrow: 1, padding: 24, paddingTop: Platform.OS === 'android' ? 40 : 20 },
  header: { marginBottom: 35, alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, color: G.TEXT },
  subtitle: { fontSize: 16, marginTop: 8, textAlign: 'center', lineHeight: 22, color: G.TEXT_SEC },
  
  profileSection: { alignItems: 'center', marginBottom: 35 },
  imageWrapper: { width: 120, height: 120, borderRadius: 60, position: 'relative' },
  profileImage: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: 'rgba(245,197,24,0.35)' },
  cameraBadge: { 
    position: 'absolute', 
    bottom: 0, 
    right: 0, 
    padding: 10, 
    borderRadius: 20, 
    backgroundColor: G.GOLD,
    borderWidth: 3, 
    borderColor: G.BG,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  
  form: { width: '100%' },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginLeft: 4, color: G.TEXT },
  input: { 
    borderWidth: 1, 
    borderColor: G.GLASS_BORDER,
    backgroundColor: G.GLASS, 
    borderRadius: 16, 
    padding: 16, 
    fontSize: 16,
    color: G.TEXT,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: G.GLASS_BORDER,
    backgroundColor: G.GLASS,
    borderRadius: 16,
    overflow: 'hidden',
    height: 56,
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: G.GLASS_BORDER,
    height: '100%',
    backgroundColor: 'transparent',
  },
  flag: { fontSize: 20, marginRight: 6 },
  countryCode: { fontSize: 16, fontWeight: '700', color: G.TEXT, marginRight: 6 },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    color: G.TEXT,
    letterSpacing: 1,
  },
  btn: { 
    height: 58, 
    borderRadius: 29, 
    backgroundColor: G.GOLD,
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 20,
    shadowColor: G.GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  btnText: { color: '#000', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  infoText: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
    color: G.TEXT_SEC,
    marginLeft: 4,
  },
});
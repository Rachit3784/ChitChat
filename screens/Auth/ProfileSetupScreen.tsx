import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, 
  TextInput, Alert, ActivityIndicator, ScrollView, Image, BackHandler
} from 'react-native';
import { Camera, ChevronDown } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';

import { useCustomTheme } from '../../theme/theme';
import { updateUserProfile, checkMobileNumberExists, checkUsernameExists } from '../../firebase/Auth';
import auth from '@react-native-firebase/auth';
import userStore from '../../store/MyStore';
import EncryptionService from '../../services/chat/EncryptionService';

export default function ProfileSetupScreen({ navigation, route }: any) {
  const { userData, isNewUser, idToken } = route?.params || {};
  
  // This screen uses Google/Firestore data as the default state.
  // If the user doesn't edit the fields, the original Google/FB data is saved.
  const theme = useCustomTheme();
  const colors = theme.colors;

  const [selectedCountry, setSelectedCountry] = useState({ code: '+91', flag: '🇮🇳' });
  const [fullName, setFullName] = useState(userData?.name || '');
  const [username, setUsername] = useState(userData?.username || '');
  const [mobileNumber, setMobileNumber] = useState(userData?.mobileNumber ? userData.mobileNumber.replace('+91', '') : '');



  const [loading, setLoading] = useState(false);

  // 1. Disable Back Button: User cannot skip this screen
  useEffect(() => {
    const backAction = () => {
      Alert.alert("Wait!", "Please complete your profile setup to continue.");
      return true;
    };
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);


  const handleContinue = async () => {
    // Basic Validations
    if (!fullName.trim() || !username.trim() || mobileNumber.length < 10) {
      Alert.alert('Error', 'Full Name, Username, and a valid 10-digit Mobile Number are required.');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) throw new Error('Auth session missing');

      // 2. Check Username Uniqueness
      const uExists = await checkUsernameExists(username.trim(), currentUser.uid);
      if (uExists) {
        Alert.alert('Error', 'Username already taken. Try another one.');
        setLoading(false);
        return;
      }

      // 3. Check Mobile Number Uniqueness
      const fullMobile = `${selectedCountry.code}${mobileNumber.trim()}`;
      const mExists = await checkMobileNumberExists(fullMobile, currentUser.uid);
      if (mExists) {
        Alert.alert('Error', 'Mobile number already registered by another account.');
        setLoading(false);
        return;
      }

      // 4. Update Firestore & Local Store
      const updatedData = {
        name: fullName.trim(),
        username: username.trim().toLowerCase(),
        mobileNumber: fullMobile,
        email: currentUser.email || userData?.email || '', // Add email
        verified: true,
        photo: userData?.photo || currentUser.photoURL || null,
      };

      // Pass token to updateUserProfile so it's saved in Firestore
      const success = await updateUserProfile(currentUser.uid, updatedData, idToken);

      if (success) {
        // 5. Generate and Store E2EE KeyPair
        try {
          console.log('[ProfileSetupScreen] Initializing E2EE Keys...');
          await EncryptionService.generateAndStoreKeyPair(currentUser.uid);
        } catch (keyError) {
          console.error('Key generation failed during signup:', keyError);
          // We continue anyway as the main profile was saved, but E2EE will retry on Home
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
    <LinearGradient 
      colors={['#ffffff', '#f1f3f5']} 
      style={styles.container}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.primary }]}>Profile Setup</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {isNewUser ? "Welcome! Let's get you started." : "Please complete your profile details."}
              </Text>
            </View>

            <View style={styles.profileSection}>
              <View style={styles.imageWrapper}>
                <Image
                  source={userData?.photo ? { uri: userData.photo } : require('../../asset/UserLogo.png')}
                  style={styles.profileImage}
                />
                <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
                  <Camera size={14} color="white" />
                </View>
              </View>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Full Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your Name"
                  placeholderTextColor="#999"
                  editable={true} // Name is always editable
                />
              </View>


              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Username</Text>
                <TextInput
                  style={[
                    styles.input, 
                    { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                    userData?.username && { opacity: 0.6 }
                  ]}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  editable={!userData?.username}
                  placeholder="unique_username"
                  placeholderTextColor="#999"
                />
                {userData?.username && (
                  <Text style={styles.infoText}>Username cannot be changed once set.</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Mobile Number</Text>
                <View style={[styles.phoneInputContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <TouchableOpacity 
                    style={styles.countryPicker}
                    onPress={() => Alert.alert("Select Country", "Country selection coming soon")}
                    disabled={!!userData?.mobileNumber}
                  >
                    <Text style={styles.flag}>{selectedCountry.flag}</Text>
                    <Text style={styles.countryCode}>{selectedCountry.code}</Text>
                    {!userData?.mobileNumber && <ChevronDown size={14} color="#666" />}
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.phoneInput, { color: colors.text }]}
                    value={mobileNumber}
                    onChangeText={setMobileNumber}
                    keyboardType="phone-pad"
                    maxLength={10}
                    editable={!userData?.mobileNumber}
                    placeholder="10 digit number"
                    placeholderTextColor="#999"
                  />
                </View>
                {userData?.mobileNumber && (
                  <Text style={styles.infoText}>Mobile number cannot be changed once set.</Text>
                )}
              </View>

              <TouchableOpacity 
                style={[styles.btn, { backgroundColor: colors.primary }]} 
                onPress={handleContinue}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.btnText}>Start Chatting</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );

}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  header: { marginBottom: 25, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  profileSection: { alignItems: 'center', marginBottom: 25 },
  imageWrapper: { width: 110, height: 110, borderRadius: 55, position: 'relative' },
  profileImage: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: '#f1f3f5' },
  cameraBadge: { 
    position: 'absolute', 
    bottom: 4, 
    right: 4, 
    padding: 8, 
    borderRadius: 20, 
    borderWidth: 3, 
    borderColor: 'white',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  form: { width: '100%' },
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  input: { 
    borderWidth: 1.5, 
    borderRadius: 14, 
    padding: 14, 
    fontSize: 16,
    fontWeight: '500',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    overflow: 'hidden',
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRightWidth: 1.5,
    borderRightColor: '#eee',
    height: '100%',
    backgroundColor: '#f8f9fa',
  },
  flag: { fontSize: 20, marginRight: 4 },
  countryCode: { fontSize: 16, fontWeight: '700', color: '#333', marginRight: 4 },
  phoneInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  btn: { 
    height: 58, 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: { color: 'white', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  infoText: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
    color: '#999',
    marginLeft: 4,
  },
});
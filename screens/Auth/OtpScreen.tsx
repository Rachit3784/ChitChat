import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  SafeAreaView,
  Alert,
  Dimensions,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ChevronLeft, Mail, ShieldCheck } from 'lucide-react-native';
import userStore from '../../store/MyStore';

const { width } = Dimensions.get('window');

/* --- Sub-component: Timer --- */
const CountdownTimer = ({ start = 59, onComplete }) => {
  const [time, setTime] = useState(start);

  useEffect(() => {
    if (time === 0) {
      onComplete?.();
      return;
    }
    const id = setInterval(() => setTime(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [time]);

  return (
    <View style={styles.timerContainer}>
      <Text style={styles.timerText}>Didn't receive it? </Text>
      <Text style={styles.timerCount}>Resend in {time}s</Text>
    </View>
  );
};

export default function OtpScreen() {
  const route = useRoute();
  const navigation = useNavigation();

  // Route Params
  const params = route.params || {};
  const { email, username, fullname, password, gender, type = 'Signup' } = params;

  // State
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [error, setError] = useState('');
  const [isResendDisabled, setIsResendDisabled] = useState(true);
  const inputs = useRef([]);

  // Store actions
  const { verifyNewUser, createUser, verifyForgottedUser, forgetPasswordRequest } = userStore();
  const isForgetFlow = (type || '').toLowerCase().includes('forget');

  const handleChange = (value, index) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    // Auto focus next
    if (value && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }
    setError('');

    try {
      let res;
      if (isForgetFlow) {
        res = await verifyForgottedUser({ email, code });
      } else {
        res = await verifyNewUser({ email, password, code });
      }

      if (res?.success) {
        if (isForgetFlow) {
          navigation.replace('ResetPassword', { email });
        } else {
          navigation.replace('Interest', { email, isNewUser: 'yes' });
        }
      } else {
        setError(res?.message || 'Invalid OTP');
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
    }
  };

  const handleResend = async () => {
    setError('');
    setOtp(['', '', '', '', '', '']);
    setIsResendDisabled(true);
    inputs.current[0]?.focus();

    try {
      if (isForgetFlow) {
        await forgetPasswordRequest(email);
      } else {
        await createUser({ email, username, fullname, password, gender });
      }
      Alert.alert('Sent!', 'A new 6-digit code has been sent to your email.');
    } catch (err) {
      Alert.alert('Error', 'Failed to resend OTP. Please check your connection.');
      setIsResendDisabled(false); // Let them try again
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Back Button */}
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ChevronLeft size={24} color="#1F2937" />
        </TouchableOpacity>

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.iconCircle}>
              <Mail size={32} color="#2563EB" />
            </View>
            <Text style={styles.title}>Verify Email</Text>
            <Text style={styles.subtitle}>Enter the 6-digit code sent to</Text>
            <View style={styles.emailPill}>
              <Text style={styles.emailText}>{email || 'your email'}</Text>
            </View>
          </View>

          {/* OTP Input Grid */}
          <View style={styles.otpContainer}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={ref => (inputs.current[index] = ref)}
                value={digit}
                onChangeText={text => handleChange(text, index)}
                onKeyPress={e => handleKeyPress(e, index)}
                onFocus={() => setFocusedIndex(index)}
                keyboardType="number-pad"
                maxLength={1}
                selectionColor="#2563EB"
                style={[
                  styles.otpInput,
                  focusedIndex === index && styles.otpInputFocused,
                  digit !== '' && styles.otpInputFilled
                ]}
              />
            ))}
          </View>

          {/* Error Message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Action Button */}
          <TouchableOpacity
            onPress={handleVerify}
            activeOpacity={0.8}
            style={styles.verifyButton}
          >
            <ShieldCheck size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.verifyButtonText}>Verify & Continue</Text>
          </TouchableOpacity>

          {/* Resend Footer */}
          <View style={styles.footer}>
            {isResendDisabled ? (
              <CountdownTimer 
                onComplete={() => setIsResendDisabled(false)} 
              />
            ) : (
              <TouchableOpacity onPress={handleResend} activeOpacity={0.7}>
                <Text style={styles.resendActiveText}>Resend OTP</Text>
              </TouchableOpacity>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  backButton: { padding: 16, width: 60, marginTop: Platform.OS === 'android' ? 10 : 0 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, alignItems: 'center' },
  
  headerSection: { alignItems: 'center', marginTop: 10, marginBottom: 40 },
  iconCircle: { 
    width: 70, height: 70, borderRadius: 35, 
    backgroundColor: '#EFF6FF', justifyContent: 'center', 
    alignItems: 'center', marginBottom: 20 
  },
  title: { fontSize: 26, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 8 },
  emailPill: { 
    backgroundColor: '#F3F4F6', paddingHorizontal: 14, 
    paddingVertical: 8, borderRadius: 20, marginTop: 12 
  },
  emailText: { fontSize: 14, fontWeight: '700', color: '#2563EB' },

  otpContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    width: '100%',
  },
  otpInput: {
    width: width * 0.125, // Adjusted for slightly better spacing
    height: 58,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
  },
  otpInputFocused: {
    borderColor: '#2563EB',
    backgroundColor: '#FFF',
    // Minimalistic Shadow
    ...Platform.select({
      ios: {
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  otpInputFilled: {
    borderColor: '#2563EB',
    color: '#2563EB'
  },

  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600', marginTop: 24, textAlign: 'center' },
  
  verifyButton: {
    backgroundColor: '#111827',
    width: '100%',
    height: 58,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  verifyButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  footer: { marginTop: 32, alignItems: 'center', paddingBottom: 20 },
  timerContainer: { flexDirection: 'row', alignItems: 'center' },
  timerText: { color: '#9CA3AF', fontSize: 14 },
  timerCount: { color: '#2563EB', fontWeight: '700', fontSize: 14 },
  resendActiveText: { color: '#059669', fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' }
});
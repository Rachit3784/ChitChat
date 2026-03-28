import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Mail, User, Lock, Hash, ShoppingBasket, ChevronRight } from 'lucide-react-native';
import userStore from '../../store/MyStore';

const COLORS = {
  primary: '#10B981',      // Professional Emerald Green
  primaryLight: '#ECFDF5', 
  background: '#FFFFFF',
  textDark: '#111827',     // Slate Dark
  textMedium: '#4B5563',   // Gray 600
  textLight: '#9CA3AF',    // Gray 400
  border: '#E5E7EB',       // Gray 200
  error: '#EF4444',
  white: '#FFFFFF',
};

/* ==================== PROFESSIONAL OUTLINED INPUT ==================== */

const BorderLabelInput = ({ 
  label, 
  value, 
  onChangeText, 
  error, 
  secure, 
  keyboardType, 
  icon: Icon,
  ...props 
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={inputStyles.container}>
      {/* Label sitting on the border */}
      <View style={inputStyles.labelWrapper}>
        <Text style={[
          inputStyles.label, 
          { color: error ? COLORS.error : (isFocused ? COLORS.primary : COLORS.textMedium) }
        ]}>
          {label}
        </Text>
      </View>

      <View style={[
        inputStyles.inputWrapper, 
        { 
          borderColor: error ? COLORS.error : (isFocused ? COLORS.primary : COLORS.border),
          borderWidth: isFocused ? 1.5 : 1
        }
      ]}>
        {Icon && <Icon size={16} color={isFocused ? COLORS.primary : COLORS.textLight} style={inputStyles.icon} />}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          style={inputStyles.input}
          selectionColor={COLORS.primary}
          {...props}
        />
      </View>
      {error && <Text style={inputStyles.errorText}>{error}</Text>}
    </View>
  );
};

/* ==================== MAIN SIGNUP SCREEN ==================== */

export default function SignupScreen() {
  const navigation = useNavigation();
  const { createUser } = userStore();

  const [form, setForm] = useState({ email: '', username: '', fullname: '', password: '', gender: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (name, text) => {
    setForm(prev => ({ ...prev, [name]: text }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    let err = {};
    if (!form.email.includes('@')) err.email = 'Invalid email address';
    if (!form.username.trim()) err.username = 'Username required';
    if (!form.fullname.trim()) err.fullname = 'Full name required';
    if (!form.password || form.password.length < 6) err.password = 'Min. 6 characters';
    if (!form.gender) err.gender = 'Selection required';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await createUser(form);
      if (res?.success) {
        navigation.navigate('OTP', { ...form, type: 'SignUP' });
      } else {
        Alert.alert('Registration Failed', res?.message || 'Details already exist');
      }
    } catch (e) {
      Alert.alert('Network Error', 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <ShoppingBasket color={COLORS.primary} size={24} />
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Fill in your details to start fresh grocery shopping.</Text>
          </View>

          <View style={styles.form}>
            <BorderLabelInput label="Email" value={form.email} onChangeText={t => handleChange('email', t)} error={errors.email} icon={Mail} keyboardType="email-address" autoCapitalize="none" />
            <BorderLabelInput label="Username" value={form.username} onChangeText={t => handleChange('username', t)} error={errors.username} icon={User} autoCapitalize="none" />
            <BorderLabelInput label="Full Name" value={form.fullname} onChangeText={t => handleChange('fullname', t)} error={errors.fullname} icon={Hash} />
            <BorderLabelInput label="Password" value={form.password} onChangeText={t => handleChange('password', t)} error={errors.password} icon={Lock} secure />

            <View style={styles.genderSection}>
              <Text style={styles.sectionLabel}>GENDER</Text>
              <View style={styles.genderRow}>
                {['Male', 'Female', 'Other'].map((g) => (
                  <TouchableOpacity 
                    key={g} 
                    onPress={() => handleChange('gender', g)}
                    style={[styles.genderChip, form.gender === g && styles.activeChip]}
                  >
                    <Text style={[styles.genderText, form.gender === g && styles.activeChipText]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.gender && <Text style={styles.errorTextSmall}>{errors.gender}</Text>}
            </View>

            <TouchableOpacity 
              onPress={handleSignup} 
              disabled={loading} 
              style={[styles.btn, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <View style={styles.btnContent}>
                  <Text style={styles.btnText}>Create Account</Text>
                  <ChevronRight size={18} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.replace('login')} style={styles.loginLink}>
              <Text style={styles.loginText}>Already a member? <Text style={styles.loginTextBold}>Log In</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const inputStyles = StyleSheet.create({
  container: { marginBottom: 22 },
  labelWrapper: {
    position: 'absolute',
    top: -9,
    left: 12,
    backgroundColor: COLORS.white,
    paddingHorizontal: 4,
    zIndex: 2,
  },
  label: { 
    fontSize: 12, 
    fontWeight: '600', 
    letterSpacing: 0.2 
  },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    height: 48, 
    borderRadius: 8, 
    borderWidth: 1, 
    paddingHorizontal: 12 
  },
  icon: { marginRight: 10 },
  input: { 
    flex: 1, 
    color: COLORS.textDark, 
    fontSize: 14, 
    fontWeight: '500' 
  },
  errorText: { 
    color: COLORS.error, 
    fontSize: 11, 
    marginTop: 4, 
    marginLeft: 2, 
    fontWeight: '500' 
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 24, paddingTop: 40 },
  header: { marginBottom: 32 },
  logoBadge: { 
    width: 44, 
    height: 44, 
    backgroundColor: COLORS.primaryLight, 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 },
  subtitle: { fontSize: 13, color: COLORS.textMedium, lineHeight: 18 },
  
  genderSection: { marginBottom: 24 },
  sectionLabel: { 
    fontSize: 11, 
    fontWeight: '700', 
    color: COLORS.textLight, 
    marginBottom: 10, 
    letterSpacing: 1 
  },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderChip: { 
    flex: 1, 
    height: 40, 
    borderRadius: 6, 
    borderWidth: 1, 
    borderColor: COLORS.border, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  activeChip: { backgroundColor: COLORS.textDark, borderColor: COLORS.textDark },
  genderText: { fontSize: 13, fontWeight: '500', color: COLORS.textMedium },
  activeChipText: { color: COLORS.white },
  
  btn: { 
    backgroundColor: COLORS.primary, 
    height: 50, 
    borderRadius: 8, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  
  loginLink: { marginTop: 24, alignItems: 'center' },
  loginText: { color: COLORS.textMedium, fontSize: 13 },
  loginTextBold: { color: COLORS.primary, fontWeight: '700' },
  errorTextSmall: { color: COLORS.error, fontSize: 11, marginTop: 4 },
});
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
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Mail, Lock, ChevronRight, ShoppingBasket } from 'lucide-react-native';
import userStore from '../../store/MyStore';

const { height } = Dimensions.get('window');

const COLORS = {
  primary: '#10B981',      // Fresh Emerald
  primaryLight: '#ECFDF5',
  background: '#F9FAFB',   // Professional Gray
  surface: '#FFFFFF',
  textDark: '#111827',
  textMedium: '#4B5563',
  textLight: '#9CA3AF',
  border: '#E5E7EB',
  error: '#EF4444',
  white: '#FFFFFF',
};

/* ==================== ENHANCED BORDER-LABEL INPUT ==================== */
const BorderLabelInput = ({ label, value, onChangeText, error, secure, icon: Icon, ...props }) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.inputContainer}>
      <View style={styles.labelWrapper}>
        <Text style={[
          styles.fieldLabel, 
          { color: error ? COLORS.error : (isFocused ? COLORS.primary : COLORS.textMedium) }
        ]}>
          {label}
        </Text>
      </View>
      <View style={[
        styles.inputWrapper, 
        { borderColor: error ? COLORS.error : (isFocused ? COLORS.primary : COLORS.border) }
      ]}>
        {Icon && <Icon size={18} color={isFocused ? COLORS.primary : COLORS.textLight} style={styles.inputIcon} />}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={secure}
          style={styles.textInput}
          placeholderTextColor={COLORS.textLight}
          selectionColor={COLORS.primary}
          autoCapitalize="none"
          {...props}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

/* ==================== ENHANCED LOGIN SCREEN ==================== */
export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { login } = userStore();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    // Basic validation
    if (!form.email || !form.password) {
      setErrors({
        email: !form.email ? 'Email required' : null,
        password: !form.password ? 'Password required' : null
      });
      return;
    }

    setLoading(true);
    try {
      const result = await login(form);
      if (result.success) navigation.replace('Interest');
      else Alert.alert('Access Denied', result.message);
    } catch (err) {
      Alert.alert('Error', 'Check your internet connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Visual background element */}
      <View style={styles.topDecoration} />
      
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.headerSection}>
            <View style={styles.logoContainer}>
              <ShoppingBasket color={COLORS.primary} size={32} />
            </View>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.subText}>Sign in to access your fresh groceries</Text>
          </View>

          <View style={styles.mainCard}>
            <BorderLabelInput 
              label="EMAIL ADDRESS" 
              value={form.email} 
              onChangeText={(t) => setForm({...form, email: t})}
              error={errors.email}
              icon={Mail}
              placeholder="alex@example.com"
            />

            <BorderLabelInput 
              label="PASSWORD" 
              value={form.password} 
              onChangeText={(t) => setForm({...form, password: t})}
              error={errors.password}
              icon={Lock}
              secure
              placeholder="••••••••"
            />

            <TouchableOpacity 
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotBtnText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={handleLogin} 
              disabled={loading}
              style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <View style={styles.btnContent}>
                  <Text style={styles.loginBtnText}>Sign In</Text>
                  <ChevronRight color={COLORS.white} size={20} />
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to GroceryFresh? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupLink}>Create Account</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  topDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.3,
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 60,
    borderBottomRightRadius: 60,
    opacity: 0.05,
  },
  scrollContent: { padding: 24, paddingTop: 60 },
  headerSection: { alignItems: 'center', marginBottom: 40 },
  logoContainer: {
    width: 64,
    height: 64,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  welcomeText: { fontSize: 28, fontWeight: '800', color: COLORS.textDark },
  subText: { fontSize: 14, color: COLORS.textMedium, marginTop: 6 },

  mainCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 15,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  inputContainer: { marginBottom: 24 },
  labelWrapper: {
    position: 'absolute',
    top: -9,
    left: 12,
    backgroundColor: COLORS.white,
    paddingHorizontal: 6,
    zIndex: 2,
  },
  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 16,
  },
  inputIcon: { marginRight: 12 },
  textInput: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.textDark },
  errorText: { color: COLORS.error, fontSize: 11, marginTop: 6, fontWeight: '600' },
  
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 24 },
  forgotBtnText: { color: COLORS.textMedium, fontSize: 13, fontWeight: '600' },
  
  loginBtn: {
    backgroundColor: COLORS.primary,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loginBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
    paddingBottom: 20,
  },
  footerText: { color: COLORS.textMedium, fontSize: 14 },
  signupLink: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
});
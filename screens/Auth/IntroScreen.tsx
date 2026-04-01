import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert, StatusBar, Dimensions,
  Image,
} from 'react-native';
import { Info, MessageCircleIcon, Shield, Lock } from 'lucide-react-native';
import { loginWithGoogle } from '../../firebase/Auth';
import userStore from '../../store/MyStore';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';


type RootStackParamList = {
  WelcomeScreen: undefined;
  ProfileSetup: { userData: any; idToken: string; isNewUser: boolean };
  Signup: undefined;
  Login: undefined;
  Screens: undefined;
  AboutUsScreen: undefined;
};

type WelcomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'WelcomeScreen'>;
interface Props { navigation: WelcomeScreenNavigationProp; }

// ─── Design Tokens ────────────────────────────────────────────────────────────
const G = {
  BG: '#0A0A0A',
  GOLD: '#F5C518',
  GOLD_DIM: 'rgba(245,197,24,0.14)',
  GOLD_BORDER: 'rgba(245,197,24,0.30)',
  GLASS: 'rgba(255,255,255,0.07)',
  GLASS_BORDER: 'rgba(255,255,255,0.12)',
  TEXT: '#FFFFFF',
  TEXT_SEC: 'rgba(255,255,255,0.60)',
  TEXT_MUTED: 'rgba(255,255,255,0.36)',
  SEPARATOR: 'rgba(255,255,255,0.10)',
};

const { height } = Dimensions.get('window');

export default function WelcomeScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const result = await loginWithGoogle();
    setLoading(false);

    if (result && result.success) {
      const { isNewUser, userData, idToken } = result;
      navigation.navigate('ProfileSetup', { userData, idToken, isNewUser: !!isNewUser });
    } else {
      const errorMsg = result?.error || 'Check your connection or SHA-1.';
      Alert.alert('Sign-In Failed', errorMsg);
    }
  };

  const handleAboutUs = () => navigation.navigate('AboutUsScreen');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={G.BG} />

      {/* ── Brand Section ───────────────────────────────────────────────────── */}
      <View style={styles.brandSection}>
        {/* Logo ring */}
        <Image source={require('../../asset/AirPlaneLogo.jpg')} height={100} width={100}/>

        <Text style={styles.brandName}>ChitChat</Text>
        <Text style={styles.tagline}>Private & Encrypted Messaging</Text>

        {/* Feature pills */}
        <View style={styles.featurePills}>
          <View style={styles.pill}>
            <Lock size={12} color={G.GOLD} strokeWidth={2.5} />
            <Text style={styles.pillText}>End-to-End Encrypted</Text>
          </View>
          <View style={styles.pill}>
            <Shield size={12} color={G.GOLD} strokeWidth={2.5} />
            <Text style={styles.pillText}>No Data Collected</Text>
          </View>
        </View>
      </View>

      {/* ── Action Section ──────────────────────────────────────────────────── */}
      <View style={styles.actionSection}>
        {/* Glass card */}
        <View style={styles.glassCard}>
          <Text style={styles.cardTitle}>Get Started</Text>
          <Text style={styles.cardSubtitle}>
            Sign in securely to access your encrypted conversations
          </Text>

          {/* Google Sign-In */}
          <TouchableOpacity
            style={[styles.googleBtn, loading && { opacity: 0.75 }]}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                {/* Google G icon approximation */}
                <View style={styles.googleIconCircle}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* About Us */}
          <TouchableOpacity
            style={styles.aboutBtn}
            onPress={handleAboutUs}
            activeOpacity={0.75}
          >
            <Info size={18} color={G.TEXT_SEC} />
            <Text style={styles.aboutBtnText}>About ChitChat</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy note */}
        <Text style={styles.privacyNote}>
          By continuing, you agree to our Terms & Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: G.BG,
    justifyContent: 'space-between',
  },

  // ── Brand ────────────────────────────────────────────────────────────────────
  brandSection: {
    alignItems: 'center',
    paddingTop: height * 0.08,
    paddingHorizontal: 24,
  },

  logoOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: G.GOLD_DIM,
    borderWidth: 1.5,
    borderColor: G.GOLD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: G.GOLD,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(245,197,24,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandName: {
    fontSize: 38,
    fontWeight: '800',
    color: G.TEXT,
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: G.TEXT_SEC,
    fontWeight: '500',
    marginBottom: 24,
  },

  featurePills: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: G.GLASS,
    borderWidth: 1,
    borderColor: G.GLASS_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 12,
    color: G.TEXT_SEC,
    fontWeight: '600',
  },

  // ── Action Section ────────────────────────────────────────────────────────────
  actionSection: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  glassCard: {
    backgroundColor: G.GLASS,
    borderWidth: 1,
    borderColor: G.GLASS_BORDER,
    borderRadius: 28,
    padding: 24,
    marginBottom: 16,
  },

  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: G.TEXT,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: G.TEXT_SEC,
    lineHeight: 20,
    marginBottom: 24,
  },

  // Google Button
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 18,
    backgroundColor: G.GOLD,
    gap: 12,
    marginBottom: 16,
    shadowColor: G.GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  googleIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
  },
  googleBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: G.SEPARATOR,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '700',
    color: G.TEXT_MUTED,
    letterSpacing: 1,
  },

  // About button
  aboutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: G.GLASS_BORDER,
    gap: 10,
  },
  aboutBtnText: {
    color: G.TEXT_SEC,
    fontSize: 15,
    fontWeight: '600',
  },

  privacyNote: {
    textAlign: 'center',
    fontSize: 12,
    color: G.TEXT_MUTED,
    lineHeight: 18,
  },
});

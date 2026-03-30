import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, Alert, ActivityIndicator, SafeAreaView, StatusBar, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  User, Phone, MessageSquare, Users, LogOut, Camera, AtSign, Mail,
} from 'lucide-react-native';
import ImagePicker from 'react-native-image-crop-picker';
import userStore from '../../../store/MyStore';
import LocalDBService from '../../../localDB/LocalDBService';
import { uploadToCloudinary } from '../../../services/media/CloudinaryService';
import { updateUserProfile } from '../../../firebase/Auth';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const G = {
  BG: '#0A0A0A',
  GOLD: '#F5C518',
  GOLD_DIM: 'rgba(245,197,24,0.14)',
  GOLD_BORDER: 'rgba(245,197,24,0.28)',
  GLASS: 'rgba(255,255,255,0.07)',
  GLASS_STRONG: 'rgba(255,255,255,0.10)',
  GLASS_BORDER: 'rgba(255,255,255,0.13)',
  TEXT: '#FFFFFF',
  TEXT_SEC: 'rgba(255,255,255,0.55)',
  TEXT_MUTED: 'rgba(255,255,255,0.32)',
  SEPARATOR: 'rgba(255,255,255,0.07)',
  RED: '#FF453A',
};

const ProfileScreen = () => {
  const navigation = useNavigation<any>();
  const { userData, userModelID, logout } = userStore();
  const [stats, setStats] = useState({ registered: 0, chats: 0 });
  const [uploading, setUploading] = useState(false);

  const fetchStats = useCallback(() => {
    const registered = LocalDBService.getRegisteredCount();
    const chats = LocalDBService.getChatCount();
    setStats({ registered, chats });
  }, []);

  useFocusEffect(
    useCallback(() => { fetchStats(); }, [fetchStats])
  );

  const handlePickImage = async () => {
    try {
      const image = await ImagePicker.openPicker({
        width: 400, height: 400, cropping: true,
        includeBase64: false, mediaType: 'photo',
      });
      if (image.path) {
        setUploading(true);
        const uploadedUrl = await uploadToCloudinary(image.path);
        if (uploadedUrl && userModelID) {
          const success = await updateUserProfile(userModelID, { photo: uploadedUrl });
          if (success) {
            const { firebaseUserUpdate } = userStore.getState();
            await firebaseUserUpdate({ uid: userModelID }, null, { ...userData, photo: uploadedUrl }, false);
            Alert.alert('Success', 'Profile picture updated!');
          }
        } else {
          Alert.alert('Error', 'Failed to upload image.');
        }
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled image selection') {
        Alert.alert('Error', 'Failed to pick image.');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          try {
            // Set global sync stamp so previous history is permanently ignored on next login
            LocalDBService.setGlobalDeletedAt(Date.now());
            await logout();
            navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
          } catch {
            Alert.alert('Error', 'Failed to logout.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={G.BG} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>
      <View style={styles.headerDivider} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar Section ─────────────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickImage} disabled={uploading} activeOpacity={0.85}>
            <View style={styles.avatarWrapper}>
              {userData?.photo ? (
                <Image source={{ uri: userData.photo }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.placeholderAvatar]}>
                  <User size={56} color={G.GOLD} />
                </View>
              )}
              {uploading ? (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color={G.GOLD} />
                </View>
              ) : (
                <View style={styles.cameraBtn}>
                  <Camera size={18} color="#000" strokeWidth={2.5} />
                </View>
              )}
            </View>
          </TouchableOpacity>

          <Text style={styles.userName}>{userData?.name || 'Your Name'}</Text>
          <View style={styles.usernameRow}>
            <AtSign size={14} color={G.TEXT_MUTED} />
            <Text style={styles.usernameText}>{userData?.username || 'username'}</Text>
          </View>
        </View>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <View style={styles.statIconCircle}>
              <MessageSquare size={20} color={G.GOLD} />
            </View>
            <Text style={styles.statValue}>{stats.chats}</Text>
            <Text style={styles.statLabel}>Active Chats</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={styles.statIconCircle}>
              <Users size={20} color={G.GOLD} />
            </View>
            <Text style={styles.statValue}>{stats.registered}</Text>
            <Text style={styles.statLabel}>Contacts on App</Text>
          </View>
        </View>

        {/* ── Info Section ────────────────────────────────────────────────── */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Account Info</Text>

          <View style={styles.infoItem}>
            <View style={styles.infoIconCircle}>
              <Phone size={16} color={G.GOLD} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Mobile Number</Text>
              <Text style={styles.infoValue}>{userData?.mobileNumber || 'Not available'}</Text>
            </View>
          </View>

          <View style={[styles.infoItem, { borderBottomWidth: 0 }]}>
            <View style={styles.infoIconCircle}>
              <Mail size={16} color={G.GOLD} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Email Address</Text>
              <Text style={styles.infoValue}>{userData?.email || 'Not available'}</Text>
            </View>
          </View>
        </View>

        {/* ── Logout ──────────────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <LogOut size={20} color={G.RED} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: G.BG },

  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 20 : 10,
    paddingBottom: 14,
    height  : 90
  },
  headerTitle: {marginTop : 20, fontSize: 28, fontWeight: '800', color: G.TEXT, letterSpacing: -0.5 },
  headerDivider: { height: 1, backgroundColor: G.SEPARATOR },

  scrollContent: { paddingBottom: 120 },

  // ── Avatar ───────────────────────────────────────────────────────────────────
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: G.SEPARATOR,
  },
  avatarWrapper: { position: 'relative', marginBottom: 18 },
  avatar: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 3, borderColor: G.GOLD,
  },
  placeholderAvatar: {
    backgroundColor: G.GOLD_DIM, alignItems: 'center', justifyContent: 'center',
  },
  cameraBtn: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: G.GOLD, padding: 8, borderRadius: 18,
    borderWidth: 2.5, borderColor: G.BG,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 60, alignItems: 'center', justifyContent: 'center',
  },
  userName: {
    fontSize: 24, fontWeight: '800', color: G.TEXT,
    marginBottom: 6, letterSpacing: -0.3,
  },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  usernameText: { fontSize: 15, color: G.TEXT_MUTED, fontWeight: '500' },

  // ── Stats ────────────────────────────────────────────────────────────────────
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: G.GLASS,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: G.GLASS_BORDER,
    paddingVertical: 20,
    overflow: 'hidden',
  },
  statItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  statDivider: { width: 1, backgroundColor: G.GLASS_BORDER },
  statIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: G.GOLD_DIM, borderWidth: 1, borderColor: G.GOLD_BORDER,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: G.GOLD },
  statLabel: { fontSize: 12, color: G.TEXT_SEC, fontWeight: '500' },

  // ── Info Card ────────────────────────────────────────────────────────────────
  infoCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: G.GLASS,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: G.GLASS_BORDER,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  infoCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: G.TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1.0,
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: G.SEPARATOR,
    gap: 14,
  },
  infoIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: G.GOLD_DIM, borderWidth: 1, borderColor: G.GOLD_BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  infoTextContainer: { flex: 1 },
  infoLabel: { fontSize: 12, color: G.TEXT_MUTED, fontWeight: '500', marginBottom: 3 },
  infoValue: { fontSize: 15, fontWeight: '600', color: G.TEXT },

  // ── Logout ───────────────────────────────────────────────────────────────────
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,69,58,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.25)',
    gap: 10,
    marginBottom : 20
  },
  logoutText: { color: G.RED, fontSize: 16, fontWeight: '700' },
});

export default ProfileScreen;
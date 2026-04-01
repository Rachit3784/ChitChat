import React from 'react';
import {
  ScrollView, View, Text, StyleSheet,
  Dimensions, StatusBar, SafeAreaView, TouchableOpacity, Share
} from 'react-native';
import Animated, { FadeInDown, FadeIn, ZoomIn, SlideInLeft } from 'react-native-reanimated';
import { useCustomTheme } from '../../theme/theme';

const { width } = Dimensions.get('window');

// ─── MATTE THEME TOKENS ───────────────────────────────────────────────────────
const light = {
  bg: '#F5F3EF', bg2: '#EDEAE4', surface: '#FFFFFF', surface2: '#F9F7F4',
  border: '#E0DDD7', border2: '#CBC7C0',
  txt: '#1A1916', txt2: '#5C5A55', txt3: '#9A978F',
  acc1: '#C0392B', acc2: '#2C5F8A', acc3: '#1D7A4A', acc4: '#8B6914',
  india1: '#D4700A', india3: '#1A6B2A',
};
const dark = {
  bg: '#141210', bg2: '#1C1A17', surface: '#211F1C', surface2: '#2A2824',
  border: '#363330', border2: '#4A4743',
  txt: '#F0EDE8', txt2: '#9E9A93', txt3: '#5E5C57',
  acc1: '#E05A4B', acc2: '#5A9BC4', acc3: '#3DAF6B', acc4: '#D4A840',
  india1: '#FFA830', india3: '#3EC05A',
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

const FeatureChip = ({ icon, label, t, delay }: any) => (
  <Animated.View entering={FadeInDown.delay(delay)}
    style={[s.featChip, { backgroundColor: t.surface, borderColor: t.border }]}>
    <Text style={s.featIcon}>{icon}</Text>
    <Text style={[s.featLabel, { color: t.txt2 }]}>{label}</Text>
  </Animated.View>
);

const GalleryCell = ({ icon, name, desc, tag, tagColor, t, delay }: any) => (
  <Animated.View entering={FadeInDown.delay(delay).springify()}
    style={[s.gcell, { backgroundColor: t.surface, borderColor: t.border }]}>
    <Text style={s.gcellIcon}>{icon}</Text>
    <Text style={[s.gcellName, { color: t.txt }]}>{name}</Text>
    <Text style={[s.gcellDesc, { color: t.txt3 }]}>{desc}</Text>
    <View style={[s.gcellTag, { backgroundColor: tagColor + '20', borderColor: tagColor + '50' }]}>
      <Text style={[s.gcellTagText, { color: tagColor }]}>{tag}</Text>
    </View>
  </Animated.View>
);

const PromiseRow = ({ icon, title, desc, t, delay }: any) => (
  <Animated.View entering={SlideInLeft.delay(delay).springify()}
    style={[s.promise, { borderBottomColor: t.border }]}>
    <View style={[s.promiseIcon, { backgroundColor: t.surface2, borderColor: t.border2 }]}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[s.promiseTitle, { color: t.txt }]}>{title}</Text>
      <Text style={[s.promiseDesc, { color: t.txt2 }]}>{desc}</Text>
    </View>
  </Animated.View>
);

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────
const AboutUsScreen = () => {
  const { isDarkMode } = useCustomTheme();
  const t = isDarkMode ? dark : light;

  const handleShare = async () => {
    try {
      await Share.share({
        message: 'Hey! Check out this full-stack React Native Chat App built by Rachit Gupta. It features End-to-End Encryption, HD Video Calling, Status Updates, Realtime WhatsApp-style Read Receipts, and offline caching.\n\nGitHub: https://github.com/Rachit3784/ChitChat',
      });
    } catch (error) {
      console.log(error);
    }
  };

  const features = [
    { icon: '🔒', label: 'E2E Crypto' }, { icon: '🎥', label: 'Video Call' },
    { icon: '🖼️', label: 'Media Share' }, { icon: '✨', label: 'Status' },
    { icon: '✔️', label: 'Read Ticks' }, { icon: '⚡', label: 'Fast Cache' },
    { icon: '👤', label: 'Profiles' }, { icon: '🔔', label: 'Push Notifs' },
  ];

  const gallery = [
    { icon: '🔒', name: 'End-to-End Encryption', desc: 'Secure local SQLite + AES key pairs', tag: 'Secured', tagColor: t.acc1 },
    { icon: '🎥', name: 'P2P Video Calling', desc: 'WebRTC based Low-latency HD Video', tag: 'WebRTC', tagColor: t.acc2 },
    { icon: '✔️', name: 'Read Receipts', desc: 'WhatsApp-style Single/Double/Blue Ticks', tag: 'Sync', tagColor: t.acc4 },
    { icon: '⚡', name: 'Offline Caching', desc: 'High-speed loading with Async/SQLite', tag: 'Perf', tagColor: t.acc3 },
    { icon: '🖼️', name: 'Status & Likes', desc: '24hr disappearing stories with reactions', tag: 'Social', tagColor: t.acc1 },
    { icon: '🚀', name: 'Background Tasks', desc: 'Headless JS & Notifee integrations', tag: 'Native', tagColor: t.acc2 },
  ];

  const skills = [
    'React Native', 'Redux', 'Zustand', 'Firebase', 'TypeScript', 'JavaScript'
  ];

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.bg }]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={t.surface}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>

        {/* HERO */}
        <View style={[s.hero, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
          <Animated.View entering={FadeIn.delay(100)}
            style={[s.logoFrame, { backgroundColor: t.bg2, borderColor: t.border2 }]}>
            <Text style={{ fontSize: 36 }}>💬</Text>
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(200)} style={[s.appName, { color: t.txt }]}>
            ChitChat
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(300)} style={[s.heroTagline, { color: t.txt3 }]}>
            A SHOWCASE APP BY RACHIT GUPTA
          </Animated.Text>
          <Animated.View entering={FadeInDown.delay(400)} style={s.heroMeta}>
            {['📱 Hybrid Native', '🔒 256-Bit AES', '⚡ Local Caching', '⚛️ React Native'].map((chip, i) => (
              <View key={i} style={[s.metaChip, { backgroundColor: t.surface2, borderColor: t.border2 }]}>
                <Text style={[s.metaChipText, { color: t.txt2 }]}>{chip}</Text>
              </View>
            ))}
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(550)}>
            <TouchableOpacity onPress={handleShare} style={[s.dlBtn, { backgroundColor: t.txt }]} activeOpacity={0.82}>
              <Text style={[s.dlBtnText, { color: t.bg }]}>Share Application Resume</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* FEATURES */}
        <View style={s.section}>
          <Text style={[s.secLabel, { color: t.txt3 }]}>Core Capabilities</Text>
          <Text style={[s.secTitle, { color: t.txt }]}>Technical Highlights</Text>
          <Text style={[s.secSub, { color: t.txt2 }]}>
            Designed with advanced architectural patterns, strict synchronization, and optimal performance.
          </Text>
          <View style={s.featGrid}>
            {features.map((f, i) => (
              <FeatureChip key={i} {...f} t={t} delay={100 + i * 30} />
            ))}
          </View>
        </View>

        <View style={[s.divider, { backgroundColor: t.border }]} />

        {/* GALLERY */}
        <View style={s.section}>
          <Text style={[s.secLabel, { color: t.txt3 }]}>Showcase</Text>
          <Text style={[s.secTitle, { color: t.txt }]}>Built for Scale</Text>
          <Text style={[s.secSub, { color: t.txt2 }]}>Complex Native Modules & State Management implemented beautifully.</Text>
          <View style={s.galleryGrid}>
            {gallery.map((g, i) => (
              <GalleryCell key={i} {...g} t={t} delay={100 + i * 60} />
            ))}
          </View>
        </View>

        <View style={[s.divider, { backgroundColor: t.border }]} />

        {/* DEVELOPER */}
        <View style={s.section}>
          <Text style={[s.secLabel, { color: t.txt3 }]}>The Maker</Text>
          <Text style={[s.secTitle, { color: t.txt }]}>Rachit Gupta</Text>
          <Animated.View entering={FadeInDown.delay(200).springify()}
            style={[s.devCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={[s.devTop, { backgroundColor: t.bg2, borderBottomColor: t.border }]}>
              <View style={[s.devAvatar, { backgroundColor: t.surface, borderColor: t.border2 }]}>
                <Text style={{ fontSize: 32 }}>👨‍💻</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.devName, { color: t.txt }]}>React Native Developer</Text>
                <Text style={[s.devRole, { color: t.acc2 }]}>BTech CSE (2022 - 2026 Batch)</Text>
                <Text style={[s.devCountry, { color: t.txt3 }]}>🇮🇳  India</Text>
              </View>
            </View>
            <View style={s.devBody}>
              <Text style={[s.devBio, { color: t.txt2 }]}>
                Passionate frontend engineer experienced with building hybrid mobile applications that feel fully native. I specialize in complex state synchronization, native bridging, WebRTC, and UI/UX optimization.
              </Text>
              <View style={s.devTags}>
                {skills.map((tag, i) => (
                  <View key={i} style={[s.devTag, { backgroundColor: t.surface2, borderColor: t.border2 }]}>
                    <Text style={[s.devTagText, { color: t.acc2 }]}>{tag}</Text>
                  </View>
                ))}
              </View>
              <View style={s.devSocials}>
                {[{ icon: '🐙', label: 'GitHub' }, { icon: '💼', label: 'LinkedIn' }, { icon: '📧', label: 'Email' }].map((soc, i) => (
                  <TouchableOpacity key={i}
                    style={[s.socBtn, { backgroundColor: t.surface2, borderColor: t.border }]}
                    activeOpacity={0.7}>
                    <Text style={{ fontSize: 18 }}>{soc.icon}</Text>
                    <Text style={[s.socLabel, { color: t.txt3 }]}>{soc.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Animated.View>
        </View>

        {/* FOOTER */}
        <View style={s.footer}>
          <Text style={[s.footBrand, { color: t.txt }]}>ChitChat Showcase</Text>
          <Text style={[s.footVer, { color: t.txt3 }]}>
            Developed by Rachit Gupta  ·  © 2026
            
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

// ─── STYLES ──────────────────────────────────────────────────────────────────
const cellW = (width - 44 - 10) / 2;

const s = StyleSheet.create({
  safe: { flex: 1 },
  hero: {
    paddingTop: 40, paddingBottom: 46, paddingHorizontal: 24,
    alignItems: 'center', borderBottomWidth: 1,
  },
  logoFrame: {
    width: 78, height: 78, borderRadius: 20, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
  },
  appName: { fontSize: 46, fontWeight: '700', letterSpacing: -1.5, marginBottom: 8 },
  heroTagline: {
    fontSize: 11, fontWeight: '600', letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 22,
  },
  heroMeta: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 8, marginBottom: 28,
  },
  metaChip: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  metaChipText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  dlBtn: { paddingHorizontal: 34, paddingVertical: 14, borderRadius: 8, marginTop: 12 },
  dlBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },

  section: { paddingHorizontal: 22, paddingTop: 36, paddingBottom: 4 },
  secLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2.5,
    textTransform: 'uppercase', marginBottom: 5,
  },
  secTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4 },
  secSub: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  divider: { height: 1, marginTop: 32 },

  featGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featChip: {
    width: (width - 44 - 24) / 4,
    borderRadius: 10, borderWidth: 1, padding: 12, alignItems: 'center',
  },
  featIcon: { fontSize: 22, marginBottom: 6 },
  featLabel: {
    fontSize: 10, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.3, textAlign: 'center',
  },

  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gcell: {
    width: cellW, borderRadius: 12, borderWidth: 1,
    padding: 18, alignItems: 'center', minHeight: 130,
  },
  gcellIcon: { fontSize: 28, marginBottom: 8 },
  gcellName: { fontSize: 13, fontWeight: '700', marginBottom: 3, textAlign: 'center' },
  gcellDesc: { fontSize: 10, textAlign: 'center', lineHeight: 14 },
  gcellTag: {
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 4, borderWidth: 1,
  },
  gcellTagText: {
    fontSize: 9, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },

  promise: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 16, paddingVertical: 18, borderBottomWidth: 1,
  },
  promiseIcon: {
    width: 42, height: 42, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  promiseTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  promiseDesc: { fontSize: 12.5, lineHeight: 18 },

  devCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginTop: 16 },
  devTop: {
    flexDirection: 'row', alignItems: 'center',
    gap: 16, padding: 22, borderBottomWidth: 1,
  },
  devAvatar: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  devName: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  devRole: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  devCountry: { fontSize: 11, marginTop: 4 },
  devBody: { padding: 20 },
  devBio: { fontSize: 13, lineHeight: 22, marginBottom: 16 },
  devTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 18 },
  devTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  devTagText: { fontSize: 10, fontWeight: '800' },
  devSocials: { flexDirection: 'row', gap: 8 },
  socBtn: {
    flex: 1, borderRadius: 8, borderWidth: 1,
    padding: 12, alignItems: 'center', gap: 4,
  },
  socLabel: {
    fontSize: 9, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  footer: { paddingVertical: 40, alignItems: 'center', paddingHorizontal: 24, marginTop: 20 },
  footBrand: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, marginBottom: 6 },
  footVer: { fontSize: 11, marginBottom: 16, textAlign: 'center', lineHeight: 18 },
});

export default AboutUsScreen;
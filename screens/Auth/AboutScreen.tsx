import React from 'react';
import {
  ScrollView, View, Text, StyleSheet,
  Dimensions, StatusBar, SafeAreaView, TouchableOpacity,
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

const StatCard = ({ icon, value, label, accentColor, t, delay }) => (
  <Animated.View entering={ZoomIn.delay(delay).springify()}
    style={[s.statCard, { backgroundColor: t.surface, borderColor: t.border }]}>
    <Text style={s.statIcon}>{icon}</Text>
    <Text style={[s.statValue, { color: t.txt }]}>{value}</Text>
    <Text style={[s.statLabel, { color: t.txt3 }]}>{label}</Text>
    <View style={[s.statBar, { backgroundColor: accentColor }]} />
  </Animated.View>
);

const FeatureChip = ({ icon, label, t, delay }) => (
  <Animated.View entering={FadeInDown.delay(delay)}
    style={[s.featChip, { backgroundColor: t.surface, borderColor: t.border }]}>
    <Text style={s.featIcon}>{icon}</Text>
    <Text style={[s.featLabel, { color: t.txt2 }]}>{label}</Text>
  </Animated.View>
);

const GalleryCell = ({ icon, name, desc, tag, tagColor, t, delay }) => (
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

const PromiseRow = ({ icon, title, desc, t, delay }) => (
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

const ReviewCard = ({ initials, name, text, t, delay }) => (
  <Animated.View entering={FadeInDown.delay(delay).springify()}
    style={[s.review, { backgroundColor: t.surface, borderColor: t.border }]}>
    <View style={s.reviewHead}>
      <View style={[s.reviewAvatar, { backgroundColor: t.bg2, borderColor: t.border2 }]}>
        <Text style={[s.reviewInitials, { color: t.txt2 }]}>{initials}</Text>
      </View>
      <View>
        <Text style={[s.reviewName, { color: t.txt }]}>{name}</Text>
        <Text style={[s.reviewStars, { color: t.acc4 }]}>★★★★★  5.0</Text>
      </View>
    </View>
    <Text style={[s.reviewText, { color: t.txt2 }]}>{text}</Text>
  </Animated.View>
);

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────
const AboutUsScreen = () => {
  const { isDarkMode } = useCustomTheme();
  const t = isDarkMode ? dark : light;

  const features = [
    { icon: '💬', label: 'Chat' }, { icon: '📞', label: 'Voice' },
    { icon: '🎥', label: 'Video HD' }, { icon: '🤖', label: 'Smart AI' },
    { icon: '📜', label: 'Shairy' }, { icon: '🎵', label: 'Music' },
    { icon: '📚', label: 'Books' }, { icon: '🎧', label: 'Audio' },
    { icon: '📖', label: 'eBooks' }, { icon: '🎬', label: 'Stories' },
    { icon: '✨', label: 'Status' }, { icon: '🔒', label: 'Privacy' },
  ];

  const gallery = [
    { icon: '💬', name: 'Chat Interface', desc: 'Bubbles, reactions & Hinglish keyboard', tag: 'Core', tagColor: t.acc1 },
    { icon: '🤖', name: 'AI Assistant', desc: 'Thinks in Hindi & English', tag: 'AI', tagColor: t.acc2 },
    { icon: '📜', name: 'Shairy', desc: 'Urdu & Hindi poetry', tag: 'Culture', tagColor: t.acc4 },
    { icon: '🎧', name: 'Audio Books', desc: 'Listen & learn on the go', tag: 'Learn', tagColor: t.acc3 },
    { icon: '🎵', name: 'Music Status', desc: 'Share songs as stories', tag: 'Social', tagColor: t.acc1 },
    { icon: '📚', name: 'Library', desc: 'eBooks, novels, references', tag: 'Learn', tagColor: t.acc2 },
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
            DHADKAN OF BHARAT  ·  🇮🇳
          </Animated.Text>
          <Animated.View entering={FadeInDown.delay(400)} style={s.heroMeta}>
            {['📱  v 2.0.4', '⭐  4.8 Rating', '🔒  Privacy First', '🇮🇳  Made in India'].map((chip, i) => (
              <View key={i} style={[s.metaChip, { backgroundColor: t.surface2, borderColor: t.border2 }]}>
                <Text style={[s.metaChipText, { color: t.txt2 }]}>{chip}</Text>
              </View>
            ))}
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(550)}>
            <TouchableOpacity style={[s.dlBtn, { backgroundColor: t.txt }]} activeOpacity={0.82}>
              <Text style={[s.dlBtnText, { color: t.bg }]}>Download Free on Play Store</Text>
            </TouchableOpacity>
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(700)} style={[s.dlSub, { color: t.txt3 }]}>
            2.5M+ downloads  ·  No ads  ·  No data selling
          </Animated.Text>
        </View>

        {/* STATS */}
        <View style={s.section}>
          <Text style={[s.secLabel, { color: t.txt3 }]}>Numbers</Text>
          <Text style={[s.secTitle, { color: t.txt }]}>Trusted at Scale</Text>
          <View style={s.statsGrid}>
            <StatCard icon="📥" value="2.5M+" label="Downloads" accentColor={t.acc1} t={t} delay={100} />
            <StatCard icon="🔥" value="180K" label="Daily Active" accentColor={t.acc2} t={t} delay={150} />
            <StatCard icon="⭐" value="4.8" label="Rating" accentColor={t.acc4} t={t} delay={200} />
            <StatCard icon="🌍" value="25+" label="Countries" accentColor={t.acc3} t={t} delay={250} />
            <StatCard icon="💬" value="50M+" label="Msgs / Day" accentColor={t.acc2} t={t} delay={300} />
            <StatCard icon="🏆" value="#1" label="India Rank" accentColor={t.india1} t={t} delay={350} />
          </View>
        </View>

        <View style={[s.divider, { backgroundColor: t.border }]} />

        {/* FEATURES */}
        <View style={s.section}>
          <Text style={[s.secLabel, { color: t.txt3 }]}>Features</Text>
          <Text style={[s.secTitle, { color: t.txt }]}>One App, Everything</Text>
          <Text style={[s.secSub, { color: t.txt2 }]}>
            Communication, creativity, and culture — all in one place.
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
          <Text style={[s.secTitle, { color: t.txt }]}>See It in Action</Text>
          <Text style={[s.secSub, { color: t.txt2 }]}>A glimpse of what's inside ChitChat.</Text>
          <View style={s.galleryGrid}>
            {gallery.map((g, i) => (
              <GalleryCell key={i} {...g} t={t} delay={100 + i * 60} />
            ))}
          </View>
        </View>

        <View style={[s.divider, { backgroundColor: t.border }]} />

        {/* PROMISE */}
        <View style={s.section}>
          <Text style={[s.secLabel, { color: t.txt3 }]}>Our Promise</Text>
          <Text style={[s.secTitle, { color: t.txt }]}>What We Stand For</Text>
          <PromiseRow icon="🔒" title="Zero Data Selling" desc="Your conversations, your data. We have never and will never sell or mine your private information." t={t} delay={100} />
          <PromiseRow icon="🇮🇳" title="Indian at Heart" desc="Built by Indian developers. Designed for Indian culture, languages, and everyday life." t={t} delay={200} />
          <PromiseRow icon="🕊️" title="Free Forever" desc="Connectivity should never have a price tag. ChitChat stays free, always." t={t} delay={300} />
          <PromiseRow icon="⚡" title="No Compromise on Speed" desc="HD calls and instant messages — engineered for low-bandwidth Indian networks." t={t} delay={400} />
          <PromiseRow icon="🤖" title="AI That Gets You" desc="Understands Hinglish, corrects naturally, writes poetry, and thinks alongside you." t={t} delay={500} />
        </View>

        {/* QUOTE */}
        <Animated.View entering={FadeInDown.delay(200).springify()}
          style={[s.quoteBlock, { backgroundColor: t.surface, borderColor: t.border, borderLeftColor: t.acc1 }]}>
          <Text style={[s.quoteText, { color: t.txt }]}>
            "Baat karne se hi baat banti hai — bas niyat saaf aur connection ChitChat hona chahiye."
          </Text>
          <Text style={[s.quoteAttr, { color: t.txt3 }]}>— Team ChitChat  ·  🇮🇳</Text>
        </Animated.View>

        <View style={[s.divider, { backgroundColor: t.border }]} />

        {/* REVIEWS */}
        <View style={s.section}>
          <Text style={[s.secLabel, { color: t.txt3 }]}>Reviews</Text>
          <Text style={[s.secTitle, { color: t.txt }]}>Loved by Millions</Text>
          <ReviewCard initials="PS" name="Priya S." text="The Shairy collection is unlike anything else. I spend hours reading Urdu poetry — beautifully curated and personal." t={t} delay={100} />
          <ReviewCard initials="AK" name="Arjun K." text="The AI actually understands Hinglish without switching to awkward English. Voice call quality is crystal clear too." t={t} delay={200} />
          <ReviewCard initials="FZ" name="Fatima Z." text="The eBook + audio explanation feature is genuinely next-level for students. Nothing else comes close." t={t} delay={300} />
        </View>

        <View style={[s.divider, { backgroundColor: t.border }]} />

        {/* DEVELOPER */}
        <View style={s.section}>
          <Text style={[s.secLabel, { color: t.txt3 }]}>The Maker</Text>
          <Text style={[s.secTitle, { color: t.txt }]}>Behind ChitChat</Text>
          <Animated.View entering={FadeInDown.delay(200).springify()}
            style={[s.devCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={[s.devTop, { backgroundColor: t.bg2, borderBottomColor: t.border }]}>
              <View style={[s.devAvatar, { backgroundColor: t.surface, borderColor: t.border2 }]}>
                <Text style={{ fontSize: 32 }}>👨‍💻</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.devName, { color: t.txt }]}>Keval / Your Name</Text>
                <Text style={[s.devRole, { color: t.acc2 }]}>Founder & Lead Developer</Text>
                <Text style={[s.devCountry, { color: t.txt3 }]}>🇮🇳  India · Indie Developer</Text>
              </View>
            </View>
            <View style={s.devBody}>
              <Text style={[s.devBio, { color: t.txt2 }]}>
                A self-driven developer from India who believed that technology should speak in the language of its people — not just English. ChitChat is that belief, brought to life.
              </Text>
              <View style={s.devTags}>
                {['React Native', 'Node.js', 'AI / ML', 'UX Design', '🇮🇳 Made in India'].map((tag, i) => (
                  <View key={i} style={[s.devTag, { backgroundColor: t.surface2, borderColor: t.border2 }]}>
                    <Text style={[s.devTagText, { color: t.txt2 }]}>{tag}</Text>
                  </View>
                ))}
              </View>
              <View style={s.devSocials}>
                {[{ icon: '🐙', label: 'GitHub' }, { icon: '💼', label: 'LinkedIn' }, { icon: '🐦', label: 'Twitter' }, { icon: '📧', label: 'Email' }].map((soc, i) => (
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

        {/* INDIA BANNER */}
        <View style={[s.indiaStripeRow, { marginTop: 38 }]}>
          <View style={[s.indiaS, { backgroundColor: t.india1 }]} />
          <View style={[s.indiaS, { backgroundColor: t.txt }]} />
          <View style={[s.indiaS, { backgroundColor: t.india3 }]} />
        </View>
        <Animated.View entering={FadeInDown.delay(200)}
          style={[s.indiaCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={{ fontSize: 32 }}>🇮🇳</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.indiaTitle, { color: t.txt }]}>Proudly Made in India</Text>
            <Text style={[s.indiaSub, { color: t.txt2 }]}>
              Built with local talent for global standards. Connecting hearts from Kashmir to Kanyakumari.
            </Text>
          </View>
        </Animated.View>

        {/* FOOTER */}
        <View style={s.footer}>
          <Text style={[s.footBrand, { color: t.txt }]}>ChitChat</Text>
          <Text style={[s.footVer, { color: t.txt3 }]}>
            Version 2.0.4  ·  © 2025 ChitChat Inc.  ·  Made with ❤️ in India
          </Text>
          <View style={s.footLinks}>
            {['Privacy', 'Terms', 'Contact', 'Blog'].map((l, i) => (
              <TouchableOpacity key={i}>
                <Text style={[s.footLink, { color: t.txt2 }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
    fontSize: 11, fontWeight: '600', letterSpacing: 3,
    textTransform: 'uppercase', marginBottom: 22,
  },
  heroMeta: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 8, marginBottom: 28,
  },
  metaChip: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  metaChipText: { fontSize: 12, fontWeight: '600' },
  dlBtn: { paddingHorizontal: 34, paddingVertical: 14, borderRadius: 8, marginBottom: 12 },
  dlBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  dlSub: { fontSize: 11, fontWeight: '500' },

  section: { paddingHorizontal: 22, paddingTop: 36, paddingBottom: 4 },
  secLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2.5,
    textTransform: 'uppercase', marginBottom: 5,
  },
  secTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4 },
  secSub: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  divider: { height: 1, marginTop: 32 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  statCard: {
    width: (width - 44 - 20) / 3,
    borderRadius: 12, borderWidth: 1, padding: 16, alignItems: 'center',
  },
  statIcon: { fontSize: 20, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  statLabel: {
    fontSize: 9, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', marginTop: 4, textAlign: 'center',
  },
  statBar: { height: 2.5, width: '100%', borderRadius: 2, marginTop: 12, opacity: 0.6 },

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
  gcellDesc: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  gcellTag: {
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 4, borderWidth: 1,
  },
  gcellTagText: {
    fontSize: 10, fontWeight: '700',
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

  quoteBlock: {
    margin: 32, padding: 24, borderRadius: 12,
    borderWidth: 1, borderLeftWidth: 3,
  },
  quoteText: { fontSize: 17, fontStyle: 'italic', lineHeight: 28, marginBottom: 12 },
  quoteAttr: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase',
  },

  review: {
    borderRadius: 12, borderWidth: 1, padding: 18, marginTop: 10,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  reviewAvatar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  reviewInitials: { fontSize: 13, fontWeight: '800' },
  reviewName: { fontSize: 14, fontWeight: '700' },
  reviewStars: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  reviewText: { fontSize: 13, lineHeight: 20 },

  devCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginTop: 16 },
  devTop: {
    flexDirection: 'row', alignItems: 'center',
    gap: 16, padding: 22, borderBottomWidth: 1,
  },
  devAvatar: {
    width: 70, height: 70, borderRadius: 35, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  devName: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  devRole: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  devCountry: { fontSize: 11, marginTop: 4 },
  devBody: { padding: 20 },
  devBio: { fontSize: 13.5, lineHeight: 22, marginBottom: 16 },
  devTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 18 },
  devTag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 5, borderWidth: 1 },
  devTagText: { fontSize: 11, fontWeight: '700' },
  devSocials: { flexDirection: 'row', gap: 8 },
  socBtn: {
    flex: 1, borderRadius: 8, borderWidth: 1,
    padding: 12, alignItems: 'center', gap: 4,
  },
  socLabel: {
    fontSize: 9, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  indiaStripeRow: {
    flexDirection: 'row', marginHorizontal: 22,
    borderRadius: 4, overflow: 'hidden', height: 4,
  },
  indiaS: { flex: 1 },
  indiaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 22, marginTop: 10, padding: 20,
    borderRadius: 12, borderWidth: 1,
  },
  indiaTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  indiaSub: { fontSize: 12, lineHeight: 18 },

  footer: { paddingVertical: 40, alignItems: 'center', paddingHorizontal: 24 },
  footBrand: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, marginBottom: 6 },
  footVer: { fontSize: 11, marginBottom: 16, textAlign: 'center', lineHeight: 18 },
  footLinks: { flexDirection: 'row', gap: 24 },
  footLink: { fontSize: 12, fontWeight: '700' },
});

export default AboutUsScreen;
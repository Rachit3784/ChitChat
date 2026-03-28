import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Search, ArrowLeft, UserCheck, Cloud } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';
import LocalDBService, { LocalContact } from '../../../localDB/LocalDBService';
import ContactSyncService from '../../../services/ContactSyncService';
import { colors } from '../../../theme/color';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type SearchResult = {
  firebase_uid: string;
  name: string;
  username?: string;
  phoneNumber: string;
  photo?: string | null;
  fromCache: boolean; // true = SQLite, false = Firebase search result
};

const HEADER_BG = '#1a237e';
const ACCENT = '#1565c0';

// ─────────────────────────────────────────────
// Helper – query Firestore for a search term
// ─────────────────────────────────────────────
async function searchFirebase(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  try {
    // Search by username (exact prefix)
    const byUsername = await firestore()
      .collection('users')
      .where('username', '>=', q)
      .where('username', '<=', q + '\uf8ff')
      .limit(10)
      .get();

    byUsername.docs.forEach(doc => {
      const d = doc.data();
      results.push({
        firebase_uid: doc.id,
        name: d.name || d.username || 'Unknown',
        username: d.username,
        phoneNumber: d.mobileNumber || '',
        photo: d.photo || null,
        fromCache: false,
      });
    });

    // Search by mobile number
    const byPhone = await firestore()
      .collection('users')
      .where('mobileNumber', '>=', q)
      .where('mobileNumber', '<=', q + '\uf8ff')
      .limit(10)
      .get();

    byPhone.docs.forEach(doc => {
      const d = doc.data();
      if (!results.find(r => r.firebase_uid === doc.id)) {
        results.push({
          firebase_uid: doc.id,
          name: d.name || d.username || 'Unknown',
          username: d.username,
          phoneNumber: d.mobileNumber || '',
          photo: d.photo || null,
          fromCache: false,
        });
      }
    });
  } catch (err) {
    console.error('[UserListScreen] Firebase search error:', err);
  }

  return results;
}

// ─────────────────────────────────────────────
// Convert LocalContact → SearchResult
// ─────────────────────────────────────────────
function localToResult(c: LocalContact): SearchResult {
  return {
    firebase_uid: c.firebase_uid || '',
    name: c.name,
    username: undefined,
    phoneNumber: c.phoneNumber,
    photo: c.photo,
    fromCache: true,
  };
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────
const UserListScreen = () => {
  const navigation = useNavigation<any>();

  // Base list from SQLite (phone contacts on app)
  const [baseContacts, setBaseContacts] = useState<SearchResult[]>([]);
  const [displayList, setDisplayList] = useState<SearchResult[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial load ─────────────────────────────
  const loadContacts = useCallback(async () => {
    try {
      let registered = LocalDBService.getRegisteredUsers();
      if (registered.length === 0) {
        await ContactSyncService.syncContacts();
        registered = LocalDBService.getRegisteredUsers();
      }
      const mapped = registered.map(localToResult);
      setBaseContacts(mapped);
      setDisplayList(mapped);
    } catch (e) {
      console.error('[UserListScreen] loadContacts error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // ── Pull-to-refresh ───────────────────────────
  const onRefresh = async () => {
    setRefreshing(true);
    await ContactSyncService.syncContacts();
    await loadContacts();
    setRefreshing(false);
  };

  // ── Debounced search ──────────────────────────
  const handleSearch = (query: string) => {
    setSearchQuery(query);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setDisplayList(baseContacts);
      setSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const q = query.trim().toLowerCase();

      // 1. SQLite local match first (name, phone, username)
      const localMatches = LocalDBService.getRegisteredUsers().filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.phoneNumber.includes(q)
      ).map(localToResult);

      setDisplayList(localMatches);

      // 2. Firebase fallback
      setSearching(true);
      const fbResults = await searchFirebase(query.trim());
      setSearching(false);

      if (fbResults.length > 0) {
        // Merge: keep local + add fb results that are not already shown
        const merged = [...localMatches];
        fbResults.forEach(fb => {
          if (!merged.find(m => m.firebase_uid === fb.firebase_uid)) {
            merged.push(fb);
          }
        });
        setDisplayList(merged);
      }
    }, 400); // 400 ms debounce
  };

  // ── Navigate to chat (unknown or known) ───────
  const openChat = (item: SearchResult) => {
    // If not in SQLite, ensure it gets upserted so we have their profile cached.
    // We set chatInit: 0 because they shouldn't appear on HomeScreen until a message is sent.
    if (!item.fromCache || item.phoneNumber.startsWith('unknown_')) {
      LocalDBService.upsertContacts([{
        phoneNumber: item.phoneNumber || `unknown_${item.firebase_uid}`,
        firebase_uid: item.firebase_uid,
        name: item.name,
        photo: item.photo || null,
        isRegistered: 1,
        chatInit: 0,
        lastSync: Date.now(),
      }]);
    }


    navigation.navigate('ChatScreen', {
      contactUid: item.firebase_uid,
      contactName: item.name,
      contactPhoto: item.photo,
    });
  };

  // ── Render item ───────────────────────────────
  const renderItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity style={styles.contactItem} activeOpacity={0.7} onPress={() => openChat(item)}>
      <View style={styles.avatarContainer}>
        {item.photo ? (
          <Image source={{ uri: item.photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.placeholderAvatar]}>
            <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.contactInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
          {!item.fromCache && (
            <View style={styles.badge}>
              <Cloud size={10} color="#fff" />
              <Text style={styles.badgeText}>Found online</Text>
            </View>
          )}
        </View>
        {item.username ? (
          <Text style={styles.usernameText}>@{item.username}</Text>
        ) : null}
        <Text style={styles.contactStatus} numberOfLines={1}>{item.phoneNumber}</Text>
      </View>
      <UserCheck size={20} color={ACCENT} />
    </TouchableOpacity>
  );

  // ── Render ────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>New Chat</Text>
          <Text style={styles.headerSubtitle}>{baseContacts.length} contacts on app</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={18} color="#9e9e9e" style={{ marginLeft: 4 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone or @username"
            placeholderTextColor="#b0bec5"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {searching && <ActivityIndicator size="small" color={ACCENT} style={{ marginRight: 8 }} />}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loaderText}>Loading contacts...</Text>
        </View>
      ) : (
        <FlatList
          data={displayList}
          keyExtractor={(item) => item.firebase_uid || item.phoneNumber}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No results found' : 'No contacts on app yet'}
              </Text>
              <Text style={styles.emptySubText}>
                {searchQuery
                  ? 'Try searching by name, phone number, or @username'
                  : 'Pull down to sync contacts from your phone'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} />
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },

  // Header
  header: {
    backgroundColor: HEADER_BG,
    paddingTop: Platform.OS === 'android' ? 36 : 12,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 6,
  },
  backButton: { marginRight: 14, padding: 4 },
  headerTitleContainer: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  // Search
  searchContainer: {
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 46,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#212121',
    paddingVertical: 0,
  },

  // List
  listContent: { paddingBottom: 30, flexGrow: 1 },

  // Contact item
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eeeeee',
    backgroundColor: '#fff',
  },
  avatarContainer: { marginRight: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  placeholderAvatar: {
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  contactInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  badgeText: { color: '#fff', fontSize: 10, marginLeft: 3, fontWeight: '600' },
  usernameText: { fontSize: 13, color: '#5c6bc0', marginBottom: 1 },
  contactStatus: { fontSize: 13, color: '#9e9e9e' },

  // States
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { color: '#78909c', marginTop: 12, fontSize: 14 },
  emptyContainer: {
    flex: 1,
    paddingTop: 80,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#546e7a', textAlign: 'center' },
  emptySubText: { fontSize: 13, color: '#90a4ae', marginTop: 8, textAlign: 'center' },
});

export default UserListScreen;
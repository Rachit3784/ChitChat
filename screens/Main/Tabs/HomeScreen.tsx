import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  AppState,
  FlatList,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MessageSquarePlus, Search } from 'lucide-react-native';
import NotificationService from '../../../services/NotificationService';
import userStore from '../../../store/MyStore';
import LocalDBService, { LocalContact } from '../../../localDB/LocalDBService';
import MessageSyncService from '../../../services/chat/MessageSyncService';
import EncryptionService from '../../../services/chat/EncryptionService';
import PresenceService from '../../../services/status/PresenceService';

// ─── Glass Design Tokens ─────────────────────────────────────────────────────
const G = {
  BG: '#0A0A0A',
  GOLD: '#F5C518',
  GLASS: 'rgba(255,255,255,0.07)',
  GLASS_BORDER: 'rgba(255,255,255,0.12)',
  TEXT: '#FFFFFF',
  TEXT_SEC: 'rgba(255,255,255,0.55)',
  SEPARATOR: 'rgba(255,255,255,0.07)',
};

const HomeScreen = () => {
  const { userModelID } = userStore();
  const navigation = useNavigation<any>();
  const appState = useRef(AppState.currentState);
  const [chatUsers, setChatUsers] = useState<LocalContact[]>([]);

  const fetchChatUsers = useCallback(() => {
    const users = LocalDBService.getChatUsers();
    setChatUsers(users);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchChatUsers();
    }, [fetchChatUsers])
  );

  const checkAndUpdatePermission = useCallback(async () => {
    if (!userModelID) return;
    await NotificationService.requestPermission();
    await NotificationService.updateFCMToken(userModelID);
  }, [userModelID]);

  useEffect(() => {
    const init = async () => {
      if (!userModelID) return;

      PresenceService.initialize(userModelID);

      try {
        await checkAndUpdatePermission();
        const pubKey = await EncryptionService.getContactPublicKey(userModelID);
        if (!pubKey) {
          await EncryptionService.generateAndStoreKeyPair(userModelID);
        }
        MessageSyncService.setOnInboxUpdatedCallback(() => { fetchChatUsers(); });
        MessageSyncService.listenToInbox(userModelID);
        MessageSyncService.monitorConnectivity();
      } catch (err) {
        console.error('[HomeScreen] Init error:', err);
      }
    };
    init();

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        await checkAndUpdatePermission();
        fetchChatUsers();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      MessageSyncService.setOnInboxUpdatedCallback(null);
    };
  }, [userModelID, fetchChatUsers, checkAndUpdatePermission]);

  const formatTime = (ts: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - ts) / 86400000);
    if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'short' });
  };

  const renderChatItem = ({ item }: { item: LocalContact }) => (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => {
        navigation.navigate('Screens', {
          screen: 'ChatScreen',
          params: { contactUid: item.firebase_uid, contactName: item.name, contactPhoto: item.photo },
        });
      }}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {item.photo ? (
          <Image source={{ uri: item.photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.placeholderAvatar]}>
            <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        {/* Online dot placeholder */}
        <View style={styles.onlineDot} />
      </View>

      {/* Info */}
      <View style={styles.chatInfo}>
        <View style={styles.chatHeaderRow}>
          <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.chatTime}>
            {formatTime(item.chatTimestamp || item.lastSync || 0)}
          </Text>
        </View>
        <View style={styles.messageRow}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage || item.phoneNumber}
          </Text>
          {item.unreadCount && item.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={G.BG} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>ChitChat</Text>
          <Text style={styles.headerSub}>{chatUsers.length} conversations</Text>
        </View>
        <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
          <Search size={20} color={G.GOLD} />
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View style={styles.headerDivider} />

      {chatUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <MessageSquarePlus size={36} color={G.GOLD} />
          </View>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtext}>Start your first encrypted chat</Text>
          <TouchableOpacity
            style={styles.startChatBtn}
            onPress={() => navigation.navigate('Screens', { screen: 'UserListScreen' })}
            activeOpacity={0.8}
          >
            <Text style={styles.startChatBtnText}>Start a Chat</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={chatUsers}
          keyExtractor={(item) => item.phoneNumber}
          renderItem={renderChatItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Screens', { screen: 'UserListScreen' })}
        activeOpacity={0.85}
      >
        <MessageSquarePlus size={24} color="#000" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: G.BG,
  },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    height : 120,
    paddingTop: Platform.OS === 'android' ? 20 : 10,
    paddingBottom: 14,
    backgroundColor: G.BG,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: G.TEXT,
    marginTop : 20,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: G.TEXT_SEC,
    marginTop: 2,
    fontWeight: '500',
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: G.GLASS,
    borderWidth: 1,
    borderColor: G.GLASS_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDivider: {
    height: 1,
    backgroundColor: G.SEPARATOR,
    marginHorizontal: 0,
  },

  // ── List ─────────────────────────────────────────────────────────
  listContent: {
    paddingBottom: 100,
    paddingTop: 6,
  },

  // ── Chat Item ─────────────────────────────────────────────────────
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: G.SEPARATOR,
  },

  avatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: 'rgba(245,197,24,0.35)',
  },
  placeholderAvatar: {
    backgroundColor: 'rgba(245,197,24,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: G.GOLD,
    fontSize: 22,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#30D158',
    borderWidth: 2,
    borderColor: G.BG,
  },

  chatInfo: {
    flex: 1,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '700',
    color: G.TEXT,
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 11,
    color: G.TEXT_SEC,
    fontWeight: '500',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: {
    fontSize: 13,
    color: G.TEXT_SEC,
    flex: 1,
    marginRight: 8,
  },
  unreadBadge: {
    backgroundColor: G.GOLD,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
  },

  // ── Empty state ────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(245,197,24,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: G.TEXT,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: G.TEXT_SEC,
    textAlign: 'center',
    marginBottom: 28,
  },
  startChatBtn: {
    backgroundColor: G.GOLD,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: G.GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  startChatBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // ── FAB ────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 92,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: G.GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: G.GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 12,
  },
});

export default HomeScreen;

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  SafeAreaView, ActivityIndicator, RefreshControl, Platform, StatusBar,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Eye, Heart, Camera } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import StatusService, { GroupedStatus, StatusData } from '../../../services/status/StatusService';
import userStore from '../../../store/MyStore';

// ─── Glass Design Tokens ─────────────────────────────────────────────────────
const G = {
  BG: '#0A0A0A',
  GOLD: '#F5C518',
  GOLD_DIM: 'rgba(245,197,24,0.15)',
  GOLD_BORDER: 'rgba(245,197,24,0.30)',
  GLASS: 'rgba(255,255,255,0.07)',
  GLASS_STRONG: 'rgba(255,255,255,0.10)',
  GLASS_BORDER: 'rgba(255,255,255,0.12)',
  TEXT: '#FFFFFF',
  TEXT_SEC: 'rgba(255,255,255,0.55)',
  TEXT_MUTED: 'rgba(255,255,255,0.32)',
  SEPARATOR: 'rgba(255,255,255,0.07)',
  SUCCESS: '#30D158',
};

const VIEWED_STATUSES_KEY = 'chitchat_viewed_statuses';

const StatusScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { userModelID, userName, userData } = userStore();
  const myPhoto = userData?.photo || '';

  const [myStatuses, setMyStatuses] = useState<StatusData[]>([]);
  const [contactGroups, setContactGroups] = useState<GroupedStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());

  const loadViewedIds = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(VIEWED_STATUSES_KEY);
      if (raw) setViewedIds(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  const saveViewedId = useCallback(async (statusId: string) => {
    setViewedIds(prev => {
      const next = new Set(prev);
      next.add(statusId);
      AsyncStorage.setItem(VIEWED_STATUSES_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const fetchStatuses = useCallback(async () => {
    if (!userModelID) return;
    try {
      const [mine, contacts] = await Promise.all([
        StatusService.getMyStatuses(userModelID),
        StatusService.getContactStatuses(userModelID, viewedIds),
      ]);
      setMyStatuses(mine);
      setContactGroups(contacts);
    } catch (err) {
      console.error('[StatusScreen] Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userModelID, viewedIds]);

  useEffect(() => { loadViewedIds(); }, []);

  useFocusEffect(
    useCallback(() => { fetchStatuses(); }, [fetchStatuses])
  );

  const onRefresh = () => { setRefreshing(true); fetchStatuses(); };

  const openStatusViewer = (group: GroupedStatus, isMyStatus = false) => {
    group.statuses.forEach(s => saveViewedId(s.id));
    navigation.navigate('Screens', {
      screen: 'StatusViewerScreen',
      params: {
        statuses: group.statuses,
        ownerName: group.ownerName,
        ownerPhoto: group.ownerPhoto,
        isMyStatus,
      },
    });
  };

  const openInsights = () => {
    if (myStatuses.length === 0) return;
    navigation.navigate('Screens', {
      screen: 'StatusInsightsScreen',
      params: { statuses: myStatuses },
    });
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return 'Yesterday';
  };

  // ── Status Ring ──────────────────────────────────────────────────────────────
  const StatusRing = ({ photo, hasUnseen, size = 52 }: { photo?: string; hasUnseen: boolean; size?: number }) => (
    <View style={[
      st.ring,
      {
        width: size + 10,
        height: size + 10,
        borderRadius: (size + 10) / 2,
        borderColor: hasUnseen ? G.GOLD : 'rgba(255,255,255,0.20)',
        borderWidth: hasUnseen ? 2.5 : 1.5,
        backgroundColor: hasUnseen ? G.GOLD_DIM : 'transparent',
      },
    ]}>
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={[st.placeholderAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={st.placeholderText}>{(userName || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
    </View>
  );

  // ── My Status Row ────────────────────────────────────────────────────────────
  const renderMyStatus = () => {
    if (myStatuses.length > 0) {
      const latestTs = Math.max(...myStatuses.map(s => s.createdAt));
      const totalViews = myStatuses.reduce((sum, s) => sum + s.viewCount, 0);
      const totalLikes = myStatuses.reduce((sum, s) => sum + s.likeCount, 0);

      return (
        <TouchableOpacity
          style={st.myStatusRow}
          onPress={() => openStatusViewer({
            ownerUid: userModelID!,
            ownerName: userName || 'Me',
            ownerPhoto: myPhoto,
            statuses: myStatuses,
            hasUnseen: false,
            latestTimestamp: latestTs,
          }, true)}
          activeOpacity={0.75}
        >
          <StatusRing photo={myPhoto} hasUnseen={false} size={56} />
          <View style={st.myStatusInfo}>
            <Text style={st.myStatusName}>My Status</Text>
            <View style={st.myStatusMeta}>
              <Eye size={12} color={G.TEXT_SEC} />
              <Text style={st.myStatusMetaText}>{totalViews}</Text>
              <Heart size={12} color="#FF453A" />
              <Text style={st.myStatusMetaText}>{totalLikes}</Text>
              <Text style={st.myStatusTime}>{timeAgo(latestTs)}</Text>
            </View>
          </View>
          <TouchableOpacity style={st.insightsBtn} onPress={openInsights} activeOpacity={0.8}>
            <Eye size={16} color={G.GOLD} />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={st.myStatusRow}
        onPress={() => navigation.navigate('Screens', { screen: 'CreateStatusScreen' })}
        activeOpacity={0.75}
      >
        <View style={st.addStatusWrap}>
          {myPhoto ? (
            <Image source={{ uri: myPhoto }} style={st.addStatusPhoto} />
          ) : (
            <View style={[st.addStatusPhoto, st.placeholderAvatar]}>
              <Text style={st.placeholderText}>{(userName || 'U').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={st.addBadge}>
            <Plus size={12} color="#000" />
          </View>
        </View>
        <View style={st.myStatusInfo}>
          <Text style={st.myStatusName}>My Status</Text>
          <Text style={st.myStatusSub}>Tap to add status update</Text>
        </View>
        <View style={st.addStatusHint}>
          <Camera size={16} color={G.GOLD} />
        </View>
      </TouchableOpacity>
    );
  };

  // ── Contact Status Item ──────────────────────────────────────────────────────
  const renderContactStatus = ({ item }: { item: GroupedStatus }) => (
    <TouchableOpacity style={st.contactRow} onPress={() => openStatusViewer(item)} activeOpacity={0.75}>
      <StatusRing photo={item.ownerPhoto} hasUnseen={item.hasUnseen} />
      <View style={st.contactInfo}>
        <Text style={st.contactName}>{item.ownerName}</Text>
        <Text style={st.contactTime}>{timeAgo(item.latestTimestamp)}</Text>
      </View>
      <View style={[st.statusCountBadge, item.hasUnseen && st.statusCountBadgeActive]}>
        <Text style={[st.statusCount, item.hasUnseen && st.statusCountActive]}>
          {item.statuses.length}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <StatusBar barStyle="light-content" backgroundColor={G.BG} />
        <View style={st.header}>
          <Text style={st.headerTitle}>Status</Text>
        </View>
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={G.GOLD} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor={G.BG} />

      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerTitle}>Status</Text>
      </View>
      <View style={st.headerDivider} />

      <FlatList
        data={contactGroups}
        keyExtractor={(item) => item.ownerUid}
        renderItem={renderContactStatus}
        ListHeaderComponent={
          <>
            {renderMyStatus()}
            {contactGroups.length > 0 && (
              <Text style={st.sectionTitle}>Recent Updates</Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={st.emptyWrap}>
            <View style={st.emptyIconCircle}>
              <Camera size={32} color={G.GOLD} />
            </View>
            <Text style={st.emptyText}>No status updates yet</Text>
            <Text style={st.emptySubtext}>Be the first to share!</Text>
          </View>
        }
        contentContainerStyle={st.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={G.GOLD}
            colors={[G.GOLD]}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[st.fab, { bottom: Math.max(insets.bottom + 85, 92) }]}
        onPress={() => navigation.navigate('Screens', { screen: 'CreateStatusScreen' })}
        activeOpacity={0.85}
      >
        <Camera size={24} color="#000" strokeWidth={2.5} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: G.BG },

  header: {
    paddingHorizontal: 20,
    height : 90,
   
    justifyContent : 'center',
    paddingTop: Platform.OS === 'android' ? 20 : 10,
    paddingBottom: 14,
    backgroundColor: G.BG,
  },
  headerTitle: {
    marginTop : 20,
    fontSize: 28,
    fontWeight: '800',
    color: G.TEXT,
    letterSpacing: -0.5,
  },
  headerDivider: {
    height: 1,
    backgroundColor: G.SEPARATOR,
  },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 100, paddingTop: 6 },

  // ── My Status ────────────────────────────────────────────────────────────────
  myStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(245,197,24,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: G.SEPARATOR,
  },
  addStatusWrap: { position: 'relative' },
  addStatusPhoto: { width: 56, height: 56, borderRadius: 28 },
  addBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: G.GOLD, width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: G.BG,
  },
  myStatusInfo: { flex: 1, marginLeft: 14 },
  myStatusName: { fontSize: 16, fontWeight: '700', color: G.TEXT },
  myStatusSub: { fontSize: 13, color: G.TEXT_SEC, marginTop: 2 },
  myStatusMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  myStatusMetaText: { fontSize: 12, color: G.TEXT_SEC, marginRight: 2 },
  myStatusTime: { fontSize: 12, color: G.TEXT_MUTED, marginLeft: 4 },
  insightsBtn: {
    padding: 10, borderRadius: 20,
    backgroundColor: G.GOLD_DIM,
    borderWidth: 1, borderColor: G.GOLD_BORDER,
  },
  addStatusHint: {
    padding: 10, borderRadius: 20,
    backgroundColor: G.GLASS,
  },

  // ── Status Ring ──────────────────────────────────────────────────────────────
  ring: { justifyContent: 'center', alignItems: 'center' },
  placeholderAvatar: {
    backgroundColor: 'rgba(245,197,24,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: G.GOLD, fontSize: 20, fontWeight: '700' },

  // ── Section Title ────────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: G.TEXT_MUTED,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.0,
  },

  // ── Contact Row ──────────────────────────────────────────────────────────────
  contactRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: G.SEPARATOR,
  },
  contactInfo: { flex: 1, marginLeft: 14 },
  contactName: { fontSize: 16, fontWeight: '600', color: G.TEXT },
  contactTime: { fontSize: 12, color: G.TEXT_MUTED, marginTop: 2 },
  statusCountBadge: {
    minWidth: 28, height: 28, borderRadius: 14,
    backgroundColor: G.GLASS, borderWidth: 1, borderColor: G.GLASS_BORDER,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  statusCountBadgeActive: {
    backgroundColor: G.GOLD_DIM, borderColor: G.GOLD_BORDER,
  },
  statusCount: { fontSize: 13, fontWeight: '700', color: G.TEXT_SEC },
  statusCountActive: { color: G.GOLD },

  // ── Empty ────────────────────────────────────────────────────────────────────
  emptyWrap: { paddingTop: 60, alignItems: 'center', paddingHorizontal: 40 },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: G.GOLD_DIM,
    borderWidth: 1, borderColor: G.GOLD_BORDER,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyText: { fontSize: 18, color: G.TEXT, fontWeight: '600', textAlign: 'center' },
  emptySubtext: { fontSize: 14, color: G.TEXT_SEC, marginTop: 6, textAlign: 'center' },

  // ── FAB ──────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute', right: 20, bottom: 92,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: G.GOLD,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: G.GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 14,
    elevation: 12,
  },
});

export default StatusScreen;
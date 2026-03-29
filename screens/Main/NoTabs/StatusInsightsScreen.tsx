import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  SafeAreaView, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';
import { ChevronLeft, Eye, Heart, Trash2, Clock } from 'lucide-react-native';
import StatusService, {
  StatusData, StatusViewer, StatusLike,
} from '../../../services/status/StatusService';
import userStore from '../../../store/MyStore';
import { colors } from '../../../theme/color';

const G = {
  BG: '#0A0A0A',
  GOLD: '#F5C518',
  GLASS: 'rgba(255,255,255,0.07)',
  GLASS_BORDER: 'rgba(255,255,255,0.12)',
  TEXT: '#FFFFFF',
  TEXT_SEC: 'rgba(255,255,255,0.55)',
  SEPARATOR: 'rgba(255,255,255,0.07)',
};

type Tab = 'viewers' | 'likes';

const StatusInsightsScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { statuses } = route.params as { statuses: StatusData[] };
  const { userModelID } = userStore();

  const [selectedStatusIdx, setSelectedStatusIdx] = useState(0);
  const [tab, setTab] = useState<Tab>('viewers');
  const [viewers, setViewers] = useState<StatusViewer[]>([]);
  const [likes, setLikes] = useState<StatusLike[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [liveStatus, setLiveStatus] = useState<StatusData | null>(null);

  const currentStatus = liveStatus || statuses[selectedStatusIdx];

  const fetchInsights = useCallback(async () => {
    if (!currentStatus) return;
    setLoadingData(true);
    try {
      const [v, l] = await Promise.all([
        StatusService.getViewers(currentStatus.id),
        StatusService.getLikes(currentStatus.id),
      ]);
      setViewers(v);
      setLikes(l);
    } catch (err) {
      console.error('[StatusInsights] Error:', err);
    } finally {
      setLoadingData(false);
    }
  }, [currentStatus?.id]);

  useEffect(() => {
    const statusId = statuses[selectedStatusIdx]?.id;
    if (!statusId) return;

    setLoadingData(true);
    // 1. Listen to metadata changes (viewCount, likeCount)
    const unsubscribe = firestore()
      .collection('statuses')
      .doc(statusId)
      .onSnapshot(doc => {
        if (doc.exists()) {
          const d = doc.data();
          if (d) {
            setLiveStatus({ id: doc.id, ...d } as StatusData);
          }
        }
      }, err => console.error('[StatusInsights] Metadata listener error:', err));

    // 2. Initial fetch for viewers/likes
    fetchInsights();

    return () => unsubscribe();
  }, [selectedStatusIdx, statuses]);

  const handleDelete = () => {
    Alert.alert('Delete Status', 'This status will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (!userModelID) return;
          await StatusService.deleteStatus(currentStatus.id, userModelID);
          if (statuses.length <= 1) {
            navigation.goBack();
          } else {
            const newStatuses = [...statuses];
            newStatuses.splice(selectedStatusIdx, 1);
            if (selectedStatusIdx >= newStatuses.length) {
              setSelectedStatusIdx(newStatuses.length - 1);
            }
          }
        },
      },
    ]);
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  // ── User Row ───────────────────────────────────────────────────────────
  const renderUserRow = ({ item }: { item: StatusViewer | StatusLike }) => {
    const ts = 'viewedAt' in item ? item.viewedAt : item.likedAt;
    return (
      <View style={s.userRow}>
        {item.photo ? (
          <Image source={{ uri: item.photo }} style={s.userAvatar} />
        ) : (
          <View style={[s.userAvatar, s.placeholderAvatar]}>
            <Text style={s.placeholderText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={s.userInfo}>
          <Text style={s.userName}>{item.name}</Text>
          <View style={s.timeRow}>
            <Clock size={11} color={G.TEXT_SEC} />
            <Text style={s.userTime}>{timeAgo(ts)}</Text>
          </View>
        </View>
        {tab === 'likes' && <Heart size={16} color={G.GOLD} fill={G.GOLD} />}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={28} color={G.TEXT} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Status Insights</Text>
        <TouchableOpacity onPress={handleDelete} style={s.deleteBtn}>
          <Trash2 size={20} color="#ef5350" />
        </TouchableOpacity>
      </View>

      {/* Status selector (if multiple) */}
      {statuses.length > 1 && (
        <View style={s.statusSelector}>
          {statuses.map((st, i) => (
            <TouchableOpacity
              key={st.id}
              style={[s.statusDot, selectedStatusIdx === i && s.statusDotActive]}
              onPress={() => setSelectedStatusIdx(i)}
            >
              <Text style={[s.statusDotText, selectedStatusIdx === i && s.statusDotTextActive]}>
                {i + 1}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Summary card */}
      <View style={s.summaryCard}>
        <View style={s.summaryItem}>
          <Eye size={22} color={G.GOLD} />
          <Text style={s.summaryCount}>{currentStatus?.viewCount || viewers.length}</Text>
          <Text style={s.summaryLabel}>Views</Text>
        </View>
        <View style={s.divider} />
        <View style={s.summaryItem}>
          <Heart size={22} color={G.GOLD} />
          <Text style={s.summaryCount}>{currentStatus?.likeCount || likes.length}</Text>
          <Text style={s.summaryLabel}>Likes</Text>
        </View>
        <View style={s.divider} />
        <View style={s.summaryItem}>
          <Clock size={22} color={G.TEXT_SEC} />
          <Text style={s.summaryCount}>{timeAgo(currentStatus?.createdAt || 0)}</Text>
          <Text style={s.summaryLabel}>Posted</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tab, tab === 'viewers' && s.tabActive]}
          onPress={() => setTab('viewers')}
        >
          <Eye size={16} color={tab === 'viewers' ? '#000' : G.TEXT_SEC} />
          <Text style={[s.tabText, tab === 'viewers' && s.tabTextActive]}>
            Viewers ({viewers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'likes' && s.tabActive]}
          onPress={() => setTab('likes')}
        >
          <Heart size={16} color={tab === 'likes' ? '#000' : G.GOLD} fill={tab === 'likes' ? '#000' : 'transparent'} />
          <Text style={[s.tabText, tab === 'likes' && s.tabTextActive]}>
            Likes ({likes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loadingData ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={G.GOLD} />
        </View>
      ) : (
        <FlatList
          data={tab === 'viewers' ? viewers : likes}
          keyExtractor={(item) => item.uid}
          renderItem={renderUserRow}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>
                {tab === 'viewers' ? 'No views yet' : 'No likes yet'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: G.BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: G.BG, paddingVertical: 14, paddingHorizontal: 10,
    paddingTop: Platform.OS === 'android' ? 40 : 14,
    elevation: 0,
    borderBottomWidth: 1, borderBottomColor: G.SEPARATOR,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: G.TEXT, fontSize: 19, fontWeight: '700' },
  deleteBtn: { padding: 8, backgroundColor: G.GLASS, borderRadius: 20 },

  // Status selector
  statusSelector: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingVertical: 12, backgroundColor: G.BG,
    borderBottomWidth: 1, borderBottomColor: G.SEPARATOR,
  },
  statusDot: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: G.GLASS, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: G.GLASS_BORDER,
  },
  statusDotActive: { backgroundColor: G.GOLD, borderColor: G.GOLD },
  statusDotText: { fontSize: 13, fontWeight: '700', color: G.TEXT_SEC },
  statusDotTextActive: { color: '#000' },

  // Summary
  summaryCard: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: G.GLASS, marginHorizontal: 16, marginVertical: 14,
    borderRadius: 16, paddingVertical: 20,
    borderWidth: 1, borderColor: G.GLASS_BORDER,
  },
  summaryItem: { alignItems: 'center', gap: 4 },
  summaryCount: { fontSize: 18, fontWeight: '800', color: G.TEXT },
  summaryLabel: { fontSize: 12, color: G.TEXT_SEC, fontWeight: '500' },
  divider: { width: 1, height: '70%', backgroundColor: G.SEPARATOR, alignSelf: 'center' },

  // Tabs
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 8,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: G.GLASS,
    borderWidth: 1, borderColor: G.GLASS_BORDER,
  },
  tabActive: { backgroundColor: G.GOLD, borderColor: G.GOLD },
  tabText: { fontSize: 14, fontWeight: '600', color: G.TEXT_SEC },
  tabTextActive: { color: '#000' },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: G.SEPARATOR,
  },
  userAvatar: { width: 46, height: 46, borderRadius: 23, marginRight: 14, borderWidth: 2, borderColor: 'rgba(245,197,24,0.35)' },
  placeholderAvatar: { backgroundColor: 'rgba(245,197,24,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(245,197,24,0.35)' },
  placeholderText: { color: G.GOLD, fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '700', color: G.TEXT },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  userTime: { fontSize: 12, color: G.TEXT_SEC },
  emptyWrap: { paddingTop: 50, alignItems: 'center' },
  emptyText: { fontSize: 15, color: G.TEXT_SEC },
});

export default StatusInsightsScreen;

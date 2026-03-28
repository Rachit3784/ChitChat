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
            <Clock size={11} color="#9e9e9e" />
            <Text style={s.userTime}>{timeAgo(ts)}</Text>
          </View>
        </View>
        {tab === 'likes' && <Heart size={16} color="#ef5350" fill="#ef5350" />}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={28} color="#fff" />
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
          <Eye size={22} color="#5c6bc0" />
          <Text style={s.summaryCount}>{currentStatus?.viewCount || viewers.length}</Text>
          <Text style={s.summaryLabel}>Views</Text>
        </View>
        <View style={s.divider} />
        <View style={s.summaryItem}>
          <Heart size={22} color="#ef5350" />
          <Text style={s.summaryCount}>{currentStatus?.likeCount || likes.length}</Text>
          <Text style={s.summaryLabel}>Likes</Text>
        </View>
        <View style={s.divider} />
        <View style={s.summaryItem}>
          <Clock size={22} color="#78909c" />
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
          <Eye size={16} color={tab === 'viewers' ? '#fff' : '#7986cb'} />
          <Text style={[s.tabText, tab === 'viewers' && s.tabTextActive]}>
            Viewers ({viewers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'likes' && s.tabActive]}
          onPress={() => setTab('likes')}
        >
          <Heart size={16} color={tab === 'likes' ? '#fff' : '#ef5350'} />
          <Text style={[s.tabText, tab === 'likes' && s.tabTextActive]}>
            Likes ({likes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loadingData ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
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
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a237e', paddingVertical: 14, paddingHorizontal: 10,
    paddingTop: Platform.OS === 'android' ? 40 : 14,
    elevation: 6,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 19, fontWeight: '700' },
  deleteBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 },

  // Status selector
  statusSelector: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingVertical: 12, backgroundColor: '#fff', elevation: 1,
  },
  statusDot: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#e8eaf6', justifyContent: 'center', alignItems: 'center',
  },
  statusDotActive: { backgroundColor: '#3949ab' },
  statusDotText: { fontSize: 13, fontWeight: '700', color: '#7986cb' },
  statusDotTextActive: { color: '#fff' },

  // Summary
  summaryCard: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 14,
    borderRadius: 16, paddingVertical: 20,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4,
  },
  summaryItem: { alignItems: 'center', gap: 4 },
  summaryCount: { fontSize: 18, fontWeight: '800', color: '#212121' },
  summaryLabel: { fontSize: 12, color: '#78909c', fontWeight: '500' },
  divider: { width: 1, height: '70%', backgroundColor: '#e0e0e0', alignSelf: 'center' },

  // Tabs
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 8,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#e8eaf6',
  },
  tabActive: { backgroundColor: '#3949ab' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#7986cb' },
  tabTextActive: { color: '#fff' },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0',
  },
  userAvatar: { width: 46, height: 46, borderRadius: 23, marginRight: 14 },
  placeholderAvatar: { backgroundColor: '#90a4ae', justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  userTime: { fontSize: 12, color: '#9e9e9e' },
  emptyWrap: { paddingTop: 50, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#9e9e9e' },
});

export default StatusInsightsScreen;

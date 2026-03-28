/**
 * CallScreen.tsx — iOS Glassmorphism Redesign
 * Dark glass background · Gold accents · iOS-style call log
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, RefreshControl, StatusBar, SafeAreaView, Platform,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Phone, Video, PhoneIncoming, PhoneOutgoing,
  PhoneMissed, Trash2,
} from 'lucide-react-native';
import CallLogService from '../../../services/calling/CallLogService';
import { CallLog } from '../../../localDB/LocalDBService';
import userStore from '../../../store/MyStore';

// ─── Design Tokens ───────────────────────────────────────────────────────────
const G = {
  BG: '#0A0A0A',
  GOLD: '#F5C518',
  GOLD_DIM: 'rgba(245,197,24,0.14)',
  GOLD_BORDER: 'rgba(245,197,24,0.28)',
  GLASS: 'rgba(255,255,255,0.07)',
  GLASS_BORDER: 'rgba(255,255,255,0.12)',
  TEXT: '#FFFFFF',
  TEXT_SEC: 'rgba(255,255,255,0.55)',
  TEXT_MUTED: 'rgba(255,255,255,0.32)',
  SEPARATOR: 'rgba(255,255,255,0.07)',
  RED: '#FF453A',
  GREEN: '#30D158',
};

type FilterTab = 'all' | 'missed';

const CallScreen = () => {
  const navigation = useNavigation<any>();
  const { userModelID } = userStore();
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = useCallback(() => {
    const all = CallLogService.getCallLogs(100);
    setLogs(all);
  }, []);

  useFocusEffect(
    useCallback(() => { loadLogs(); }, [loadLogs])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    if (userModelID) await CallLogService.syncFromFirestore(userModelID);
    loadLogs();
    setRefreshing(false);
  };

  const handleClearLogs = () => {
    CallLogService.clearCallLogs();
    setLogs([]);
  };

  const initiateCall = (log: CallLog, type: 'video' | 'audio') => {
    navigation.navigate('Screens', {
      screen: 'OutgoingCallScreen',
      params: {
        contactUid: log.contactUid,
        contactName: log.contactName,
        contactPhoto: log.contactPhoto,
        callType: type,
      },
    });
  };

  const filteredLogs = filter === 'missed' ? logs.filter(l => l.status === 'missed') : logs;

  const getDirectionIcon = (log: CallLog) => {
    if (log.status === 'missed') return <PhoneMissed size={15} color={G.RED} />;
    if (log.direction === 'incoming') return <PhoneIncoming size={15} color={G.GREEN} />;
    return <PhoneOutgoing size={15} color={G.GOLD} />;
  };

  const getDirectionColor = (log: CallLog): string => {
    if (log.status === 'missed') return G.RED;
    if (log.direction === 'incoming') return G.GREEN;
    return G.GOLD;
  };

  const getStatusLabel = (log: CallLog): string => {
    const dir = log.direction === 'incoming' ? 'Incoming' : 'Outgoing';
    const type = log.callType === 'video' ? 'Video' : 'Voice';
    if (log.status === 'missed') return `Missed ${type}`;
    if (log.status === 'declined') return `Declined ${type}`;
    return `${dir} ${type}`;
  };

  const formatTime = (ts: number): string => {
    const date = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - ts) / 86400000);
    if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  const missedCount = logs.filter(l => l.status === 'missed').length;

  const renderItem = ({ item }: { item: CallLog }) => (
    <TouchableOpacity
      style={styles.logItem}
      onPress={() => initiateCall(item, item.callType as any)}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {item.contactPhoto ? (
          <Image source={{ uri: item.contactPhoto }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>
              {item.contactName?.charAt(0)?.toUpperCase()}
            </Text>
          </View>
        )}
        {/* Type badge */}
        <View style={[
          styles.typeBadge,
          { backgroundColor: item.callType === 'video' ? 'rgba(245,197,24,0.25)' : 'rgba(48,209,88,0.25)' },
        ]}>
          {item.callType === 'video'
            ? <Video size={9} color={G.GOLD} />
            : <Phone size={9} color={G.GREEN} />
          }
        </View>
      </View>

      {/* Info */}
      <View style={styles.logInfo}>
        <Text style={styles.contactName}>{item.contactName}</Text>
        <View style={styles.statusRow}>
          {getDirectionIcon(item)}
          <Text style={[styles.statusText, { color: getDirectionColor(item) }]}>
            {' '}{getStatusLabel(item)}
          </Text>
          {item.duration > 0 && (
            <Text style={styles.durationText}>
              {' · '}{CallLogService.formatDuration(item.duration)}
            </Text>
          )}
        </View>
      </View>

      {/* Right side */}
      <View style={styles.rightSection}>
        <Text style={styles.timeText}>{formatTime(item.startedAt)}</Text>
        <View style={styles.callBtns}>
          <TouchableOpacity
            style={styles.quickCallBtn}
            onPress={() => initiateCall(item, 'audio')}
          >
            <Phone size={15} color={G.GOLD} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickCallBtn, { marginLeft: 6 }]}
            onPress={() => initiateCall(item, 'video')}
          >
            <Video size={15} color={G.GOLD} />
          </TouchableOpacity>
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
          <Text style={styles.headerTitle}>Calls</Text>
          <Text style={styles.headerSub}>{logs.length} in history</Text>
        </View>
        {logs.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearLogs}>
            <Trash2 size={18} color={G.RED} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.headerDivider} />

      {/* Filter Pills */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
          onPress={() => setFilter('all')}
          activeOpacity={0.75}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterPill, filter === 'missed' && styles.filterPillMissed]}
          onPress={() => setFilter('missed')}
          activeOpacity={0.75}
        >
          <Text style={[styles.filterText, filter === 'missed' && styles.filterTextMissed]}>
            Missed
          </Text>
          {missedCount > 0 && (
            <View style={styles.missedBadge}>
              <Text style={styles.missedBadgeText}>{missedCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* List */}
      {filteredLogs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Phone size={36} color={G.GOLD} />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === 'missed' ? 'No missed calls' : 'No call history'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {filter === 'missed' ? 'You have no missed calls' : 'Start a call from a chat'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => `${item.id}_${item.startedAt}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={G.GOLD}
              colors={[G.GOLD]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: G.BG },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 20 : 10,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: G.TEXT, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: G.TEXT_SEC, marginTop: 2, fontWeight: '500' },
  clearBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,69,58,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,69,58,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerDivider: { height: 1, backgroundColor: G.SEPARATOR },

  filterRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: G.GLASS,
    borderWidth: 1,
    borderColor: G.GLASS_BORDER,
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: G.GOLD_DIM,
    borderColor: G.GOLD_BORDER,
  },
  filterPillMissed: {
    backgroundColor: 'rgba(255,69,58,0.12)',
    borderColor: 'rgba(255,69,58,0.25)',
  },
  filterText: { fontSize: 14, fontWeight: '600', color: G.TEXT_SEC },
  filterTextActive: { color: G.GOLD },
  filterTextMissed: { color: G.RED },
  missedBadge: {
    backgroundColor: G.RED, borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 4,
  },
  missedBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  listContent: { paddingBottom: 100 },

  logItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: G.SEPARATOR,
  },

  avatarContainer: { marginRight: 14, position: 'relative' },
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: G.GLASS_BORDER },
  avatarPlaceholder: {
    backgroundColor: 'rgba(245,197,24,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: G.GOLD, fontSize: 20, fontWeight: '700' },
  typeBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: G.BG,
  },

  logInfo: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '600', color: G.TEXT, marginBottom: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 12, fontWeight: '500' },
  durationText: { fontSize: 12, color: G.TEXT_MUTED },

  rightSection: { alignItems: 'flex-end', marginLeft: 8 },
  timeText: { fontSize: 11, color: G.TEXT_MUTED, marginBottom: 6 },
  callBtns: { flexDirection: 'row' },
  quickCallBtn: {
    padding: 7, borderRadius: 16,
    backgroundColor: G.GOLD_DIM,
    borderWidth: 1, borderColor: G.GOLD_BORDER,
  },

  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: G.GOLD_DIM, borderWidth: 1, borderColor: G.GOLD_BORDER,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: G.TEXT, textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: G.TEXT_SEC, textAlign: 'center' },
});

export default CallScreen;
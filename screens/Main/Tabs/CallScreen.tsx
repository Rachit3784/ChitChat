/**
 * CallScreen.tsx — iOS Glassmorphism Redesign
 * Dark glass background · Gold accents · iOS-style call log
 * UPDATED: Card tap -> Navigate to details · Single Video Call button
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, RefreshControl, StatusBar, SafeAreaView, Platform, Alert
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Phone, Video, PhoneIncoming, PhoneOutgoing,
  PhoneMissed, Trash2, CheckCircle2, Circle, X, CheckSquare, 
  ChevronRight, Info
} from 'lucide-react-native';
import CallLogService from '../../../services/calling/CallLogService';
import CallManageService from '../../../services/calling/CallManageService';
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
  const insets = useSafeAreaInsets();
  const { userModelID } = userStore();
  
  // --- States ---
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  
  // --- Selection Mode States ---
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadLogs = useCallback(() => {
    const all = CallLogService.getCallLogs(100);
    setLogs(all);
  }, []);

  useFocusEffect(
    useCallback(() => { 
        loadLogs(); 
        return () => {
            setIsSelectionMode(false);
            setSelectedIds(new Set());
        };
    }, [loadLogs])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    if (userModelID) {
        console.log("[CallScreen] Pull-to-refresh: Syncing history...");
        await CallLogService.syncFromFirestore(userModelID);
    }
    loadLogs();
    setRefreshing(false);
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
      if (newSelected.size === 0) setIsSelectionMode(false);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleLongPress = (id: string) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      const newSelected = new Set();
      newSelected.add(id);
      setSelectedIds(newSelected);
    }
  };

  const goToDetails = (log: CallLog) => {
    if (isSelectionMode) {
        toggleSelection(log.id);
        return;
    }
    navigation.navigate('Screens', {
        screen: 'CallDetailScreen',
        params: { log }
    });
  };

  const startQuickCall = (log: CallLog) => {
    const senderData = userStore.getState().userModel;
    CallManageService.initiateCall(
      senderData,
      log.contactUid,
      log.contactName,
      log.contactPhoto,
      'video'
    );
  };

  const filteredLogs = useMemo(() => {
     return filter === 'missed' ? logs.filter(l => l.status === 'missed') : logs;
  }, [logs, filter]);

  const getDirectionIcon = (log: CallLog) => {
    if (log.status === 'missed') return <PhoneMissed size={13} color={G.RED} />;
    if (log.direction === 'incoming') return <ArrowDownLeft size={13} color={G.GREEN} />;
    return <ArrowUpRight size={13} color={G.GOLD} />;
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

  const renderItem = ({ item }: { item: CallLog }) => {
    const isSelected = selectedIds.has(item.id);
    const statusColor = getDirectionColor(item);
    
    return (
      <TouchableOpacity
        style={[styles.logItem, isSelected && styles.selectedItem]}
        onPress={() => goToDetails(item)}
        onLongPress={() => handleLongPress(item.id)}
        activeOpacity={0.7}
      >
        {/* Selection indicator */}
        {isSelectionMode && (
          <View style={styles.selectionIndicator}>
             {isSelected ? <CheckCircle2 size={22} color={G.GOLD} /> : <Circle size={22} color={G.TEXT_MUTED} />}
          </View>
        )}

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
        </View>

        {/* Info */}
        <View style={styles.logInfo}>
          <Text style={[styles.contactName, { color: item.status === 'missed' ? G.RED : G.TEXT }]}>
            {item.contactName}
          </Text>
          <View style={styles.statusRow}>
            {item.status === 'missed' ? <PhoneMissed size={12} color={G.RED} /> : (
                item.direction === 'outgoing' ? <ArrowUpRight size={12} color={G.GOLD} /> : <ArrowDownLeft size={12} color={G.GREEN} />
            )}
            <Text style={[styles.statusText, { color: G.TEXT_MUTED }]}>
              {' '}{getStatusLabel(item)}
            </Text>
          </View>
        </View>

        {/* Right side */}
        {!isSelectionMode ? (
            <View style={styles.rightSection}>
                <Text style={styles.timeText}>{formatTime(item.startedAt)}</Text>
                <TouchableOpacity 
                    style={styles.infoBtn} 
                    onPress={() => startQuickCall(item)}
                >
                    <Video size={20} color={G.GOLD} />
                </TouchableOpacity>
            </View>
        ) : (
            <ChevronRight size={18} color={G.TEXT_MUTED} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={G.BG} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{isSelectionMode ? `${selectedIds.size} Selected` : 'Calls'}</Text>
          {!isSelectionMode && <Text style={styles.headerSub}>{logs.length} in history</Text>}
        </View>
        
        <View style={styles.headerActions}>
          {isSelectionMode ? (
            <>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setSelectedIds(new Set(filteredLogs.map(l => l.id)))}>
                <CheckSquare size={19} color={G.GOLD} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { marginLeft: 12 }]} onPress={() => {
                Alert.alert("Delete", "Delete selected call records?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => {
                        CallLogService.deleteLogs(Array.from(selectedIds));
                        setIsSelectionMode(false);
                        setSelectedIds(new Set());
                        loadLogs();
                    }}
                ]);
              }}>
                <Trash2 size={19} color={G.RED} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { marginLeft: 12 }]} onPress={() => setIsSelectionMode(false)}>
                <X size={19} color={G.TEXT} />
              </TouchableOpacity>
            </>
          ) : (
            logs.length > 0 && (
              <TouchableOpacity style={styles.clearBtn} onPress={() => {
                 Alert.alert("Clear History", "This will wipe your entire local call history.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Clear All", style: "destructive", onPress: () => {
                        CallLogService.clearCallLogs();
                        setLogs([]);
                    }}
                 ]);
              }}>
                <Trash2 size={18} color={G.RED} />
              </TouchableOpacity>
            )
          )}
        </View>
      </View>
      <View style={styles.headerDivider} />

      {/* List */}
      {filteredLogs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Phone size={36} color={G.GOLD} />
          </View>
          <Text style={styles.emptyTitle}>No call history</Text>
          <Text style={styles.emptySubtitle}>Your recent calls will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => `${item.id}_${item.startedAt}`}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 85, 100) }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={G.GOLD} colors={[G.GOLD]} />
          }
          showsVerticalScrollIndicator={false}
          extraData={selectedIds}
        />
      )}
    </SafeAreaView>
  );
};

// --- Helper Icons (Lucide missing some arrows) ---
const ArrowUpRight = ({ size, color }: any) => (
    <View style={{ transform: [{ rotate: '45deg' }] }}>
        <Phone size={size} color={color} />
    </View>
);
const ArrowDownLeft = ({ size, color }: any) => (
    <View style={{ transform: [{ rotate: '225deg' }] }}>
        <Phone size={size} color={color} />
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: G.BG },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 20 : 10,
    paddingBottom: 14, height : 110
  },
  headerTitle: {marginTop : 20, fontSize: 28, fontWeight: '800', color: G.TEXT, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: G.TEXT_SEC, marginTop: 2, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  actionBtn: { padding: 6 },
  clearBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,69,58,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,69,58,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  headerDivider: { height: 1, backgroundColor: G.SEPARATOR },

  listContent: { paddingBottom: 100 },

  logItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: G.SEPARATOR,
  },
  selectedItem: { backgroundColor: 'rgba(245,197,24,0.06)' },
  selectionIndicator: { marginRight: 15 },

  avatarContainer: { marginRight: 15 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: G.GLASS_BORDER },
  avatarPlaceholder: { backgroundColor: G.GOLD_DIM, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: G.GOLD, fontSize: 20, fontWeight: '700' },

  logInfo: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 12, fontWeight: '500' },

  rightSection: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  timeText: { fontSize: 12, color: G.TEXT_MUTED },
  infoBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: G.GOLD_DIM,
    borderWidth: 1, borderColor: G.GOLD_BORDER, alignItems: 'center', justifyContent: 'center',
  },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: G.GOLD_DIM,
    borderWidth: 1, borderColor: G.GOLD_BORDER, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: G.TEXT, textAlign: 'center', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: G.TEXT_SEC, textAlign: 'center' },
});

export default CallScreen;
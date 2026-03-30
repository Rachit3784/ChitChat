import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, SafeAreaView, StatusBar, Platform
} from 'react-native';
import { 
  ChevronLeft, Video, Phone, Calendar, 
  Clock, Info, Trash2, ArrowUpRight, ArrowDownLeft, XCircle
} from 'lucide-react-native';
import CallLogService from '../../services/calling/CallLogService';
import CallManageService from '../../services/calling/CallManageService';
import userStore from '../../store/MyStore';

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
  RED: '#FF453A',
  GREEN: '#30D158',
};

const CallDetailScreen = ({ route, navigation }: { route: any, navigation: any }) => {
  const { log } = route.params;

  const formatDateLong = (ts: number): string => {
    return new Date(ts).toLocaleDateString([], { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
  };

  const formatTimeExact = (ts: number): string => {
    return new Date(ts).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
  };

  const handleDelete = () => {
    CallLogService.deleteLogs([log.id]);
    navigation.goBack();
  };

  const handleCallBack = (type: 'audio' | 'video') => {
    const senderData = userStore.getState().userModel;
    CallManageService.initiateCall(
      senderData,
      log.contactUid,
      log.contactName,
      log.contactPhoto,
      type
    );
  };

  const getStatusInfo = () => {
    if (log.status === 'missed') return { label: 'Missed Call', color: G.RED, Icon: XCircle };
    if (log.direction === 'incoming') return { label: 'Incoming Call', color: G.GREEN, Icon: ArrowDownLeft };
    return { label: 'Outgoing Call', color: G.GOLD, Icon: ArrowUpRight };
  };

  const statusInfo = getStatusInfo();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={G.BG} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={28} color={G.TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Call Details</Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
          <Trash2 size={22} color={G.RED} />
        </TouchableOpacity>
      </View>

      {/* Contact Section */}
      <View style={styles.profileSection}>
         {log.contactPhoto ? (
            <Image source={{ uri: log.contactPhoto }} style={styles.avatar} />
         ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{log.contactName?.charAt(0)?.toUpperCase()}</Text>
            </View>
         )}
         <Text style={styles.contactName}>{log.contactName}</Text>
         <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '15', borderColor: statusInfo.color + '30' }]}>
            <statusInfo.Icon size={14} color={statusInfo.color} />
            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}> {statusInfo.label}</Text>
         </View>
      </View>

      {/* Info Cards */}
      <View style={styles.detailsContainer}>
         <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
                <Calendar size={20} color={G.GOLD} />
            </View>
            <View>
                <Text style={styles.infoLabel}>Date</Text>
                <Text style={styles.infoValue}>{formatDateLong(log.startedAt)}</Text>
            </View>
         </View>

         <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
                <Clock size={20} color={G.GOLD} />
            </View>
            <View>
                <Text style={styles.infoLabel}>Time</Text>
                <Text style={styles.infoValue}>{formatTimeExact(log.startedAt)}</Text>
            </View>
         </View>

         <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
                <Info size={20} color={G.GOLD} />
            </View>
            <View>
                <Text style={styles.infoLabel}>Duration</Text>
                <Text style={styles.infoValue}>
                    {log.duration > 0 
                        ? CallLogService.formatDuration(log.duration) 
                        : (log.status === 'missed' ? 'No answer' : 'Declined')}
                </Text>
            </View>
         </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
         <TouchableOpacity 
           style={[styles.callBtn, { backgroundColor: G.GOLD_DIM, borderColor: G.GOLD_BORDER }]}
           onPress={() => handleCallBack('video')}
         >
            <Video size={24} color={G.GOLD} />
            <Text style={styles.callBtnText}>Video Call</Text>
         </TouchableOpacity>

         <TouchableOpacity 
           style={[styles.callBtn, { backgroundColor: 'rgba(48,209,88,0.1)', borderColor: 'rgba(48,209,88,0.2)' }]}
           onPress={() => handleCallBack('audio')}
         >
            <Phone size={24} color={G.GREEN} />
            <Text style={[styles.callBtnText, { color: G.GREEN }]}>Voice Call</Text>
         </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: G.BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: Platform.OS === 'android' ? 20 : 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: G.TEXT },
  backBtn: { padding: 4 },
  deleteBtn: { padding: 4 },

  profileSection: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 30,
  },
  avatar: { 
    width: 120, 
    height: 120, 
    borderRadius: 60, 
    borderWidth: 2, 
    borderColor: G.GLASS_BORDER,
    marginBottom: 20 
  },
  avatarPlaceholder: {
    backgroundColor: G.GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 48, fontWeight: '800', color: G.GOLD },
  contactName: { fontSize: 28, fontWeight: '800', color: G.TEXT, marginBottom: 12 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },

  detailsContainer: {
    paddingHorizontal: 24,
    gap: 20,
    marginTop: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: G.GLASS,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: G.GLASS_BORDER,
  },
  infoIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  infoLabel: { fontSize: 13, color: G.TEXT_SEC, marginBottom: 2 },
  infoValue: { fontSize: 16, fontWeight: '600', color: G.TEXT },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 'auto',
    marginBottom: 40,
    paddingHorizontal: 24,
  },
  callBtn: {
    flex: 1,
    height: 60,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
  },
  callBtnText: { fontSize: 16, fontWeight: '800', color: G.GOLD },
});

export default CallDetailScreen;

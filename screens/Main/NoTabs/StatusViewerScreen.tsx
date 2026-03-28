import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, Dimensions,
  Animated, ActivityIndicator, Alert, StatusBar, Platform,
  TextInput, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Video, { VideoRef } from 'react-native-video';
import { Heart, ChevronLeft, Eye, Trash2, Music, Pause, Play, Send } from 'lucide-react-native';
import RNFS from 'react-native-fs';
import StatusService, { StatusData } from '../../../services/status/StatusService';
import { downloadBlobAsBase64 } from '../../../services/media/CloudinaryService';
import MessageSyncService from '../../../services/chat/MessageSyncService';
import userStore from '../../../store/MyStore';

const { width: SW, height: SH } = Dimensions.get('window');
const PROGRESS_BAR_HEIGHT = 3;
const STATUS_DURATION = 6000; // 6 seconds per status

const StatusViewerScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { statuses, ownerName, ownerPhoto, isMyStatus } = route.params;
  const { userModelID, userName, userData } = userStore();
  const myPhoto = userData?.photo || '';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [decryptedImages, setDecryptedImages] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [songPlaying, setSongPlaying] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const likeAnimScale = useRef(new Animated.Value(1)).current;
  const videoRef = useRef<VideoRef>(null);

  const currentStatus: StatusData = statuses[currentIndex];

  // ── Decrypt image ──────────────────────────────────────────────────────
  const decryptImage = useCallback(async (status: StatusData) => {
    if (status.type === 'text' || !status.encImageUrl || !status.encKey || !status.encKeyIv) return;

    if (decryptedImages.has(status.id)) return;

    try {
      setLoading(true);

      // 1. Check persistent filesystem cache first
      const cachedPath = await StatusService.getFromMediaCache(status.id);
      if (cachedPath) {
        const cachedBase64 = await RNFS.readFile(cachedPath, 'base64');
        if (cachedBase64) {
          setDecryptedImages(prev => new Map(prev).set(status.id, cachedBase64));
          return;
        }
      }

      // 2. Download and decrypt as fallback
      const cipherBase64 = await downloadBlobAsBase64(status.encImageUrl);
      if (!cipherBase64) throw new Error('Download failed');

      const decrypted = StatusService.decryptImageBytes(cipherBase64, status.encKey, status.encKeyIv);
      if (!decrypted) throw new Error('Decryption failed');

      // 3. Save to memory and filesystem cache
      setDecryptedImages(prev => new Map(prev).set(status.id, decrypted));
      await StatusService.saveToMediaCache(status.id, decrypted);
    } catch (err) {
      console.error('[StatusViewer] Decrypt error:', err);
    } finally {
      setLoading(false);
    }
  }, [decryptedImages]);

  // ── Record view ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isMyStatus && userModelID && userName && currentStatus) {
      StatusService.recordView(currentStatus.id, userModelID, userName, myPhoto).catch(() => {});
    }
  }, [currentIndex, currentStatus?.id]);

  // ── Check like status ──────────────────────────────────────────────────
  useEffect(() => {
    if (userModelID && currentStatus) {
      StatusService.hasLiked(currentStatus.id, userModelID).then(setLiked);
    }
  }, [currentIndex, currentStatus?.id]);

  // ── Decrypt on index change ────────────────────────────────────────────
  useEffect(() => {
    if (currentStatus?.type !== 'text') {
      decryptImage(currentStatus);
    } else {
      setLoading(false);
    }
    // Pre-decrypt next
    const next = statuses[currentIndex + 1];
    if (next && next.type !== 'text') decryptImage(next);
  }, [currentIndex]);

  // ── Progress timer ─────────────────────────────────────────────────────
  const startProgress = useCallback(() => {
    progressAnim.setValue(0);
    animRef.current?.stop();

    animRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STATUS_DURATION,
      useNativeDriver: false,
    });

    animRef.current.start(({ finished }) => {
      if (finished) goNext();
    });
  }, [currentIndex, statuses.length]);

  useEffect(() => {
    if (!loading && !paused) {
      startProgress();
    }
    return () => { animRef.current?.stop(); };
  }, [loading, paused, currentIndex]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const goNext = () => {
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      navigation.goBack();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  };

  // ── Like ───────────────────────────────────────────────────────────────
  const handleLike = async () => {
    if (!userModelID || !userName) return;
    const wasLiked = liked;
    setLiked(!wasLiked);

    // Animate heart
    Animated.sequence([
      Animated.spring(likeAnimScale, { toValue: 1.4, useNativeDriver: true, speed: 50 }),
      Animated.spring(likeAnimScale, { toValue: 1, useNativeDriver: true, speed: 50 }),
    ]).start();

    const isNowLiked = await StatusService.toggleLike(
      currentStatus.id, userModelID, userName, myPhoto
    );
    setLiked(isNowLiked);

    if (isNowLiked) {
      StatusService.sendLikeNotification(
        currentStatus.ownerUid, userModelID, userName, currentStatus.id
      ).catch(() => {});
    }
  };
  
  // ── Open Insights ──────────────────────────────────────────────────────
  const openInsights = () => {
    if (isMyStatus) {
      navigation.navigate('Screens', {
        screen: 'StatusInsightsScreen',
        params: { statuses },
      });
    }
  };



  // ── Send Reply ────────────────────────────────────────────────────────
  const handleSendReply = async () => {
    if (!replyText.trim() || !userModelID || sendingReply || isMyStatus) return;
    setSendingReply(true);
    setPaused(true);

    try {
      const statusType = currentStatus.type === 'text' ? 'text' : 'photo';
      const msg = `Replied to your ${statusType} status: ${replyText}`;
      await MessageSyncService.sendMessage(userModelID, currentStatus.ownerUid, msg);
      setReplyText('');
      Keyboard.dismiss();
      Alert.alert('Sent!', 'Reply sent to ' + ownerName);
    } catch (err) {
      console.error('[StatusViewer] Reply error:', err);
    } finally {
      setSendingReply(false);
      setPaused(false);
    }
  };

  // ── Delete own status ──────────────────────────────────────────────────
  const handleDelete = () => {
    Alert.alert('Delete Status', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (!userModelID) return;
          await StatusService.deleteStatus(currentStatus.id, userModelID);
          if (statuses.length <= 1) {
            navigation.goBack();
          } else {
            goNext();
          }
        },
      },
    ]);
  };

  // ── Time ago ───────────────────────────────────────────────────────────
  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  const imgBase64 = decryptedImages.get(currentStatus?.id);

  return (
    <View style={v.container}>
      <StatusBar hidden />

      {/* Background */}
      {currentStatus?.type === 'text' ? (
        <LinearGradient
          colors={currentStatus.bgGradient || ['#667eea', '#764ba2']}
          style={v.fullBg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={v.textContent}>{currentStatus.text}</Text>
        </LinearGradient>
      ) : loading ? (
        <View style={v.fullBg}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={v.loadingText}>Decrypting...</Text>
        </View>
      ) : imgBase64 ? (
        <Image
          source={{ uri: `data:image/jpeg;base64,${imgBase64}` }}
          style={v.fullImage}
          resizeMode="cover"
        />
      ) : (
        <View style={v.fullBg}>
          <Text style={v.loadingText}>Could not load image</Text>
        </View>
      )}

      {/* Tap zones */}
      <View style={v.tapZones}>
        <TouchableOpacity
          style={v.tapLeft}
          onPress={goPrev}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          activeOpacity={1}
        />
        <TouchableOpacity
          style={v.tapRight}
          onPress={goNext}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          activeOpacity={1}
        />
      </View>

      {/* Progress bars */}
      <View style={v.progressRow}>
        {statuses.map((_: any, i: number) => (
          <View key={i} style={v.progressTrack}>
            <Animated.View
              style={[
                v.progressFill,
                i < currentIndex
                  ? { width: '100%' }
                  : i === currentIndex
                  ? {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    }
                  : { width: '0%' },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header: avatar + name + time */}
      <View style={v.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={v.backBtn}>
          <ChevronLeft size={26} color="#fff" />
        </TouchableOpacity>
        {ownerPhoto ? (
          <Image source={{ uri: ownerPhoto }} style={v.headerAvatar} />
        ) : (
          <View style={[v.headerAvatar, v.headerAvatarPlaceholder]}>
            <Text style={v.headerAvatarText}>{(ownerName || '?').charAt(0)}</Text>
          </View>
        )}
        <View style={v.headerInfo}>
          <Text style={v.headerName}>{isMyStatus ? 'My Status' : ownerName}</Text>
          <Text style={v.headerTime}>{timeAgo(currentStatus?.createdAt)}</Text>
        </View>

        {isMyStatus && (
          <>
            <TouchableOpacity onPress={openInsights} style={v.viewBadge}>
              <Eye size={14} color="#fff" />
              <Text style={v.viewCount}>{currentStatus.viewCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={v.deleteBtn}>
              <Trash2 size={20} color="#ef5350" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Caption */}
      {!!currentStatus?.caption && (
        <View style={v.captionBar}>
          <Text style={v.captionText}>{currentStatus.caption}</Text>
        </View>
      )}

      {/* Song info + player */}
      {currentStatus?.songStreamUrl && (
        <>
          <Video
            ref={videoRef}
            source={{ uri: currentStatus.songStreamUrl }}
            paused={paused || !songPlaying}
            onLoad={(data) => {
              if (currentStatus.songStartTime) {
                videoRef.current?.seek(currentStatus.songStartTime);
              }
            }}
            onProgress={(data) => {
              // Loop within the 30s window if it reaches the end of the clip
              const start = currentStatus.songStartTime || 0;
              if (data.currentTime > start + 30) {
                videoRef.current?.seek(start);
              }
            }}
            repeat
            playInBackground={false}
            ignoreSilentSwitch="ignore"
            style={{ width: 0, height: 0 }}
          />
          <View style={v.songBadge}>
            <Music size={14} color="#fff" />
            <Text style={v.songName} numberOfLines={1}>
              {currentStatus.songName} — {currentStatus.songArtist}
            </Text>
            <TouchableOpacity onPress={() => setSongPlaying(!songPlaying)}>
              {songPlaying ? <Pause size={16} color="#fff" /> : <Play size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Bottom actions: Like & Reply */}
      {!isMyStatus && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={v.bottomContainer}
        >
          <View style={v.replyBar}>
            <TextInput
              style={v.replyInput}
              placeholder="Reply..."
              placeholderTextColor="rgba(255,255,255,0.7)"
              value={replyText}
              onChangeText={setReplyText}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
            />
            
            {replyText.length > 0 ? (
              <TouchableOpacity 
                onPress={handleSendReply} 
                style={v.sendBtn}
                disabled={sendingReply}
              >
                {sendingReply ? <ActivityIndicator size="small" color="#fff" /> : <Send size={22} color="#fff" />}
              </TouchableOpacity>
            ) : (
              <Animated.View style={{ transform: [{ scale: likeAnimScale }] }}>
                <TouchableOpacity onPress={handleLike} style={v.likeBtnSmall}>
                  <Heart
                    size={26}
                    color={liked ? '#ef5350' : '#fff'}
                    fill={liked ? '#ef5350' : 'transparent'}
                  />
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Paused indicator */}
      {paused && (
        <View style={v.pausedOverlay}>
          <Pause size={48} color="rgba(255,255,255,0.6)" />
        </View>
      )}
    </View>
  );
};

const v = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  fullBg: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  fullImage: { ...StyleSheet.absoluteFillObject, width: SW, height: SH },
  textContent: {
    fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center',
    paddingHorizontal: 32, textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 6,
  },
  loadingText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 12 },

  // Tap zones
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row', zIndex: 5,
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },

  // Progress
  progressRow: {
    flexDirection: 'row', gap: 3,
    position: 'absolute', top: Platform.OS === 'android' ? 10 : 50,
    left: 8, right: 8, zIndex: 20,
  },
  progressTrack: {
    flex: 1, height: PROGRESS_BAR_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },

  // Header
  header: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 20 : 60,
    left: 0, right: 0, zIndex: 15,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 8,
  },
  backBtn: { padding: 4 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, marginLeft: 6 },
  headerAvatarPlaceholder: { backgroundColor: '#5c6bc0', justifyContent: 'center', alignItems: 'center' },
  headerAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerInfo: { flex: 1, marginLeft: 10 },
  headerName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerTime: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  viewBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14,
  },
  viewCount: { color: '#fff', fontSize: 13, fontWeight: '600' },
  deleteBtn: {
    padding: 8, marginLeft: 6,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20,
  },

  // Caption
  captionBar: {
    position: 'absolute', bottom: 90, left: 0, right: 0, zIndex: 15,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 10, paddingHorizontal: 20,
  },
  captionText: { color: '#fff', fontSize: 15, textAlign: 'center' },

  // Song badge
  songBadge: {
    position: 'absolute', bottom: 140, left: 16, right: 16, zIndex: 15,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 20,
  },
  songName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' },

  // Bottom containers
  bottomContainer: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 0, right: 0, zIndex: 30,
    paddingHorizontal: 16,
  },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 25, paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  replyInput: {
    flex: 1, color: '#fff', fontSize: 15, paddingVertical: 8,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#3949ab', justifyContent: 'center', alignItems: 'center',
  },
  likeBtnSmall: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },

  // Paused
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 25,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
});

export default StatusViewerScreen;

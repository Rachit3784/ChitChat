import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  SafeAreaView, ScrollView, FlatList, Modal, ActivityIndicator,
  Dimensions, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {
  ChevronLeft, Camera, ImageIcon, Type, Music, Search,
  Play, Pause, X as XIcon, Send, Check,
} from 'lucide-react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import Video, { VideoRef } from 'react-native-video';
import StatusService, { STATUS_GRADIENTS } from '../../../services/status/StatusService';
import JioSaavnService, { SaavnSong } from '../../../services/status/JioSaavnService';
import userStore from '../../../store/MyStore';

const { width: SW, height: SH } = Dimensions.get('window');

type StatusType = 'image' | 'text';

const CreateStatusScreen = () => {
  const navigation = useNavigation<any>();
  const { userModelID, userName, userData } = userStore();
  const myPhoto = userData?.photo || '';

  const [statusType, setStatusType] = useState<StatusType>('image');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [textContent, setTextContent] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(0);
  const [posting, setPosting] = useState(false);

  // Song picker
  const [songModalVisible, setSongModalVisible] = useState(false);
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState<SaavnSong[]>([]);
  const [searchingMusic, setSearchingMusic] = useState(false);
  const [selectedSong, setSelectedSong] = useState<SaavnSong | null>(null);
  const [songStartTime, setSongStartTime] = useState(0);
  const [previewPaused, setPreviewPaused] = useState(true);
  const [trendingSongs, setTrendingSongs] = useState<SaavnSong[]>([]);
  const previewVideoRef = React.useRef<VideoRef>(null);

  // Reset start time when song changes
  useEffect(() => {
    setSongStartTime(0);
    setPreviewPaused(true);
  }, [selectedSong]);

  // Load trending songs on mount
  useEffect(() => {
    JioSaavnService.getTrendingSongs(12).then(setTrendingSongs);
  }, []);

  // ── Image Picker ────────────────────────────────────────────────────────
  const pickImage = async (fromCamera = false) => {
    const picker = fromCamera ? launchCamera : launchImageLibrary;
    picker(
      { mediaType: 'photo', quality: 0.9, maxWidth: 1920, maxHeight: 1920 },
      (res) => {
        if (!res.didCancel && !res.errorCode && res.assets?.[0]?.uri) {
          setImageUri(res.assets[0].uri);
          setStatusType('image');
        }
      }
    );
  };

  // ── Song Search ─────────────────────────────────────────────────────────
  const searchSongs = useCallback(async () => {
    if (!songQuery.trim()) return;
    setSearchingMusic(true);
    const { songs } = await JioSaavnService.searchSongs(songQuery.trim(), 1, 15);
    setSongResults(songs);
    setSearchingMusic(false);
  }, [songQuery]);

  // ── Post Status ─────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!userModelID || !userName) return;
    if (statusType === 'image' && !imageUri) {
      Alert.alert('No image selected', 'Pick a photo first.');
      return;
    }
    if (statusType === 'text' && !textContent.trim()) {
      Alert.alert('Empty status', 'Write something for your status.');
      return;
    }

    setPosting(true);
    try {
      let statusId: string | null = null;

      if (statusType === 'image' && imageUri) {
        statusId = await StatusService.postImageStatus(
          userModelID, userName, myPhoto, imageUri, caption || undefined, selectedSong, songStartTime
        );
      } else {
        statusId = await StatusService.postTextStatus(
          userModelID, userName, myPhoto, textContent.trim(),
          STATUS_GRADIENTS[selectedGradient], selectedSong, songStartTime
        );
      }

      if (statusId) {
        Alert.alert('Status posted! 🎉', 'Your status is now visible to contacts.');
        navigation.goBack();
      } else {
        Alert.alert('Post failed', 'Something went wrong. Try again.');
      }
    } catch (err) {
      console.error('[CreateStatus] Error:', err);
      Alert.alert('Error', 'Could not post status.');
    } finally {
      setPosting(false);
    }
  };

  // ── Song Result Item ────────────────────────────────────────────────────
  const renderSongItem = ({ item }: { item: SaavnSong }) => (
    <TouchableOpacity
      style={[s.songItem, selectedSong?.id === item.id && s.songItemSelected]}
      onPress={() => {
        setSelectedSong(item);
        setSongModalVisible(false);
      }}
    >
      <Image source={{ uri: item.albumArtSmall || item.albumArt }} style={s.songArt} />
      <View style={s.songInfo}>
        <Text style={s.songTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={s.songArtist} numberOfLines={1}>{item.artist}</Text>
        <Text style={s.songDuration}>
          {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
        </Text>
      </View>
      {selectedSong?.id === item.id && <Check size={22} color="#43e97b" />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Create Status</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

          {/* Type Selector */}
          <View style={s.typeRow}>
            <TouchableOpacity
              style={[s.typeBtn, statusType === 'image' && s.typeBtnActive]}
              onPress={() => setStatusType('image')}
            >
              <ImageIcon size={20} color={statusType === 'image' ? '#fff' : '#7986cb'} />
              <Text style={[s.typeLabel, statusType === 'image' && s.typeLabelActive]}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.typeBtn, statusType === 'text' && s.typeBtnActive]}
              onPress={() => setStatusType('text')}
            >
              <Type size={20} color={statusType === 'text' ? '#fff' : '#7986cb'} />
              <Text style={[s.typeLabel, statusType === 'text' && s.typeLabelActive]}>Text</Text>
            </TouchableOpacity>
          </View>

          {/* Image Preview / Text Editor */}
          {statusType === 'image' ? (
            <View style={s.previewArea}>
              {imageUri ? (
                <View style={s.imagePreviewWrap}>
                  <Image source={{ uri: imageUri }} style={s.imagePreview} resizeMode="cover" />
                  <TouchableOpacity style={s.changeImgBtn} onPress={() => setImageUri(null)}>
                    <XIcon size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.pickArea}>
                  <TouchableOpacity style={s.pickBtn} onPress={() => pickImage(false)}>
                    <ImageIcon size={32} color="#5c6bc0" />
                    <Text style={s.pickLabel}>Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.pickBtn} onPress={() => pickImage(true)}>
                    <Camera size={32} color="#388e3c" />
                    <Text style={s.pickLabel}>Camera</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Caption */}
              {imageUri && (
                <TextInput
                  style={s.captionInput}
                  placeholder="Add a caption..."
                  placeholderTextColor="#9e9e9e"
                  value={caption}
                  onChangeText={setCaption}
                  maxLength={200}
                  multiline
                />
              )}
            </View>
          ) : (
            <View style={s.textEditorArea}>
              <LinearGradient
                colors={STATUS_GRADIENTS[selectedGradient]}
                style={s.textPreview}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <TextInput
                  style={s.textInput}
                  placeholder="Type your status..."
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={textContent}
                  onChangeText={setTextContent}
                  maxLength={300}
                  multiline
                  textAlign="center"
                  textAlignVertical="center"
                />
              </LinearGradient>

              {/* Gradient picker */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.gradientPicker}>
                {STATUS_GRADIENTS.map((g, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setSelectedGradient(i)}
                    style={[s.gradientDot, selectedGradient === i && s.gradientDotActive]}
                  >
                    <LinearGradient colors={g} style={s.gradientDotInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Song Attachment & Trimmer */}
          <View style={s.musicSection}>
            <TouchableOpacity
              style={[s.musicBtn, selectedSong && s.musicBtnActive]}
              onPress={() => setSongModalVisible(true)}
            >
              <Music size={20} color={selectedSong ? '#fff' : '#7986cb'} />
              <Text style={[s.musicLabel, selectedSong && { color: '#fff' }]}>
                {selectedSong ? `🎵 ${selectedSong.name} — ${selectedSong.artist}` : 'Add a song clip'}
              </Text>
              {selectedSong && (
                <TouchableOpacity onPress={() => setSelectedSong(null)} style={s.removeSong}>
                  <XIcon size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {selectedSong && (
              <View style={s.trimmerCard}>
                <View style={s.trimmerHeader}>
                  <Text style={s.trimmerTitle}>Select 30s Clip</Text>
                  <TouchableOpacity 
                    onPress={() => setPreviewPaused(!previewPaused)}
                    style={s.previewToggle}
                  >
                    {previewPaused ? <Play size={18} color="#fff" fill="#fff" /> : <Pause size={18} color="#fff" fill="#fff" />}
                    <Text style={s.previewToggleText}>{previewPaused ? 'Preview' : 'Stop'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Custom Timeline Trimmer */}
                <View style={s.timelineContainer}>
                  <Text style={s.timeLabel}>
                    {Math.floor(songStartTime / 60)}:{(songStartTime % 60).toString().padStart(2, '0')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    onScroll={(e) => {
                      const x = e.nativeEvent.contentOffset.x;
                      // Manual scaling: 1px = 0.5 sec approximately
                      const newTime = Math.floor(x / 5);
                      const maxTime = Math.max(0, selectedSong.duration - 30);
                      setSongStartTime(Math.min(newTime, maxTime));
                    }}
                    scrollEventThrottle={16}
                    contentContainerStyle={{ width: (selectedSong.duration - 30) * 5 + SW - 100 }}
                  >
                    <View style={s.timelineTicks}>
                      {Array.from({ length: Math.ceil(selectedSong.duration / 5) }).map((_, i) => (
                        <View key={i} style={[s.tick, i % 2 === 0 ? s.tickTall : null]} />
                      ))}
                    </View>
                  </ScrollView>
                  <View style={s.playhead} pointerEvents="none" />
                </View>

                <Text style={s.trimmerHint}>Slide the timeline to pick the start point</Text>

                {/* Admin/Preview Player */}
                {!previewPaused && (
                  <Video
                    ref={previewVideoRef}
                    source={{ uri: selectedSong.streamUrl }}
                    paused={previewPaused}
                    onLoad={(data) => {
                      previewVideoRef.current?.seek(songStartTime);
                      if (data.duration > 0) {
                        // Just an indicator
                      }
                    }}
                    onProgress={(data) => {
                      if (data.currentTime > songStartTime + 30) {
                        setPreviewPaused(true);
                      }
                    }}
                    repeat
                    playInBackground={false}
                    ignoreSilentSwitch="ignore"
                    style={{ width: 0, height: 0 }}
                  />
                )}
              </View>
            )}
          </View>

          {/* Post Button */}
          <TouchableOpacity
            style={[s.postBtn, posting && s.postBtnDisabled]}
            onPress={handlePost}
            disabled={posting}
          >
            {posting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Send size={20} color="#fff" />
                <Text style={s.postBtnText}>Post Status</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={s.e2eeNote}>🔒 Your image statuses are encrypted before uploading</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Song Search Modal */}
      <Modal visible={songModalVisible} animationType="slide" onRequestClose={() => setSongModalVisible(false)}>
        <SafeAreaView style={s.songModal}>
          <View style={s.songHeader}>
            <TouchableOpacity onPress={() => setSongModalVisible(false)}>
              <ChevronLeft size={28} color="#212121" />
            </TouchableOpacity>
            <Text style={s.songHeaderTitle}>Search Music</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Search bar */}
          <View style={s.songSearchBar}>
            <Search size={18} color="#9e9e9e" />
            <TextInput
              style={s.songSearchInput}
              placeholder="Search songs, artists..."
              placeholderTextColor="#9e9e9e"
              value={songQuery}
              onChangeText={setSongQuery}
              onSubmitEditing={searchSongs}
              returnKeyType="search"
            />
            {songQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSongQuery(''); setSongResults([]); }}>
                <XIcon size={18} color="#9e9e9e" />
              </TouchableOpacity>
            )}
          </View>

          {searchingMusic && <ActivityIndicator color="#5c6bc0" style={{ marginTop: 20 }} />}

          <FlatList
            data={songResults.length > 0 ? songResults : trendingSongs}
            keyExtractor={(item) => item.id}
            renderItem={renderSongItem}
            contentContainerStyle={s.songList}
            ListHeaderComponent={
              songResults.length === 0 && !searchingMusic ? (
                <Text style={s.songSectionTitle}>🔥 Trending</Text>
              ) : null
            }
            ListEmptyComponent={
              !searchingMusic ? (
                <Text style={s.songEmpty}>Search for a song to add to your status</Text>
              ) : null
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a237e', paddingVertical: 14, paddingHorizontal: 10,
    paddingTop: Platform.OS === 'android' ? 40 : 14,
    elevation: 6,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },

  body: { padding: 16, paddingBottom: 40 },

  // Type selector
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#e8eaf6', borderWidth: 2, borderColor: 'transparent',
  },
  typeBtnActive: { backgroundColor: '#3949ab', borderColor: '#3949ab' },
  typeLabel: { fontSize: 15, fontWeight: '600', color: '#7986cb' },
  typeLabelActive: { color: '#fff' },

  // Image preview
  previewArea: { marginBottom: 16 },
  imagePreviewWrap: { borderRadius: 16, overflow: 'hidden', position: 'relative' },
  imagePreview: { width: '100%', height: 320, borderRadius: 16 },
  changeImgBtn: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, padding: 6,
  },
  pickArea: {
    flexDirection: 'row', gap: 20, justifyContent: 'center',
    paddingVertical: 50, backgroundColor: '#e8eaf6', borderRadius: 16,
    borderWidth: 2, borderColor: '#c5cae9', borderStyle: 'dashed',
  },
  pickBtn: { alignItems: 'center', gap: 8 },
  pickLabel: { fontSize: 14, fontWeight: '600', color: '#5c6bc0' },
  captionInput: {
    marginTop: 12, backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: '#212121',
    elevation: 1, maxHeight: 80,
  },

  // Text editor
  textEditorArea: { marginBottom: 16 },
  textPreview: {
    width: '100%', height: 300, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  textInput: {
    fontSize: 22, fontWeight: '700', color: '#fff', width: '100%',
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  gradientPicker: { marginTop: 12 },
  gradientDot: {
    width: 38, height: 38, borderRadius: 19, marginRight: 10,
    borderWidth: 3, borderColor: 'transparent', padding: 2,
  },
  gradientDotActive: { borderColor: '#1a237e' },
  gradientDotInner: { flex: 1, borderRadius: 16 },

  musicSection: { marginBottom: 20 },
  musicBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 14, elevation: 2,
  },
  musicBtnActive: { backgroundColor: '#3949ab' },
  musicLabel: { flex: 1, fontSize: 14, color: '#7986cb', fontWeight: '600' },
  removeSong: { padding: 4 },

  // Trimmer
  trimmerCard: {
    backgroundColor: '#fff', marginTop: 10, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#e8eaf6', elevation: 1,
  },
  trimmerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  trimmerTitle: { fontSize: 14, fontWeight: '700', color: '#1a237e' },
  previewToggle: { 
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#43e97b', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20,
  },
  previewToggleText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  timelineContainer: {
    height: 80, backgroundColor: '#f5f5f5', borderRadius: 10,
    position: 'relative', overflow: 'hidden', justifyContent: 'center',
  },
  timelineTicks: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingLeft: SW / 2 - 50 },
  tick: { width: 2, height: 15, backgroundColor: '#c5cae9', borderRadius: 1 },
  tickTall: { height: 25, backgroundColor: '#7986cb' },
  playhead: {
    position: 'absolute', left: SW / 2 - 50, top: 0, bottom: 0,
    width: 3, backgroundColor: '#1a237e', zIndex: 10,
  },
  timeLabel: {
    position: 'absolute', top: 5, right: 10, zIndex: 10,
    fontSize: 12, fontWeight: '700', color: '#1a237e',
    backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 6, borderRadius: 4,
  },
  trimmerHint: { textAlign: 'center', fontSize: 11, color: '#9e9e9e', marginTop: 8, fontStyle: 'italic' },

  // Post
  postBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#1a237e', paddingVertical: 16, borderRadius: 16,
    elevation: 4, marginBottom: 12,
  },
  postBtnDisabled: { opacity: 0.6 },
  postBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  e2eeNote: { textAlign: 'center', fontSize: 12, color: '#78909c' },

  // Song modal
  songModal: { flex: 1, backgroundColor: '#fff' },
  songHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 14,
    paddingTop: Platform.OS === 'android' ? 40 : 14,
    borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  songHeaderTitle: { fontSize: 18, fontWeight: '700', color: '#212121' },
  songSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    backgroundColor: '#f5f5f5', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  songSearchInput: { flex: 1, fontSize: 15, color: '#212121', paddingVertical: 8 },
  songList: { paddingHorizontal: 16, paddingBottom: 30 },
  songSectionTitle: { fontSize: 16, fontWeight: '700', color: '#212121', marginVertical: 12 },
  songEmpty: { textAlign: 'center', color: '#9e9e9e', marginTop: 40, fontSize: 14 },
  songItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0',
  },
  songItemSelected: { backgroundColor: '#e8f5e9', borderRadius: 10, paddingHorizontal: 8 },
  songArt: { width: 52, height: 52, borderRadius: 8 },
  songInfo: { flex: 1 },
  songTitle: { fontSize: 15, fontWeight: '600', color: '#212121' },
  songArtist: { fontSize: 13, color: '#757575', marginTop: 2 },
  songDuration: { fontSize: 12, color: '#9e9e9e', marginTop: 2 },
});

export default CreateStatusScreen;

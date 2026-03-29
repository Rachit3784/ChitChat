import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  Dimensions,
  Animated,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import {
  Send,
  ChevronLeft,
  MoreVertical,
  Check,
  CheckCheck,
  Lock,
  Smile,
  Paperclip,
  Clock,
  Image as ImageIcon,
  Camera,
  Download,
  X as XIcon,
} from 'lucide-react-native';
import MessageSyncService from '../../../services/chat/MessageSyncService';
import LocalDBService, { CachedMessage } from '../../../localDB/LocalDBService';
import EncryptionService from '../../../services/chat/EncryptionService';
import ImageEncryptionService from '../../../services/media/ImageEncryptionService';
import userStore from '../../../store/MyStore';
import CallButton from '../../../components/calling/CallButton';
import RNFS from 'react-native-fs';

// Module `activeChatId` export for notification suppression
export let activeChatId: string | null = null;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUBBLE_MAX_W = SCREEN_WIDTH * 0.72;
const IMAGE_BUBBLE_W = SCREEN_WIDTH * 0.68;

// ─── Theme ───────────────────────────────────────────────────────────────────
const THEME = {
  headerBg: '#0A0A0A',
  senderBubble: 'rgba(245,197,24,0.15)', // Glassy Gold
  receiverBubble: 'rgba(255,255,255,0.08)', // Glassy White/Gray
  chatBg: '#0A0A0A',
  inputBg: 'rgba(255,255,255,0.08)', // Glass input
  sendBtn: '#F5C518',
  sendBtnDisabled: 'rgba(255,255,255,0.15)',
  senderText: '#F5C518',
  receiverText: '#FFFFFF',
  timestampSender: 'rgba(245,197,24,0.7)',
  timestampReceiver: 'rgba(255,255,255,0.45)',
  headerText: '#FFFFFF',
  headerSubText: 'rgba(255,255,255,0.55)',
  warningBg: 'rgba(245,197,24,0.1)',
  warningBorder: 'rgba(245,197,24,0.25)',
  warningText: '#F5C518',
  lockBadge: '#F5C518',
  glassBorder: 'rgba(255,255,255,0.12)',
};

// ─── Shimmer placeholder ──────────────────────────────────────────────────────
const ImageShimmer = ({ width, height }: { width: number; height: number }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });
  return (
    <Animated.View style={[styles.shimmer, { width, height, opacity }]} />
  );
};

// ─── Encrypted Image Bubble ───────────────────────────────────────────────────
interface EncryptedImageBubbleProps {
  item: CachedMessage;
  isMe: boolean;
  sharedSecret: Uint8Array | null;
  onSaveToGallery: (item: CachedMessage) => void;
}

const EncryptedImageBubble = ({
  item,
  isMe,
  sharedSecret,
  onSaveToGallery,
}: EncryptedImageBubbleProps) => {
  const [thumbBase64, setThumbBase64] = useState<string | null>(null);
  const [fullBase64, setFullBase64] = useState<string | null>(null);
  const [isFullyCached, setIsFullyCached] = useState(false);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(true);

  const aspectRatio =
    item.imageWidth && item.imageHeight
      ? item.imageHeight / item.imageWidth
      : 1;
  const bubbleH = Math.min(IMAGE_BUBBLE_W * aspectRatio, 380);

  // Load thumbnail on mount
  useEffect(() => {
    let cancelled = false;

    const loadThumb = async () => {
      // 0. If full high-res image is already perfectly cached locally, use that instantly!
      if (item.imageLocalPath) {
        try {
          const exists = await RNFS.exists(item.imageLocalPath);
          if (exists && !cancelled) {
            setIsFullyCached(true);
            setThumbLoading(false);
            return;
          }
        } catch {}
      }

      // 1. Sender: use original image URI directly as preview
      if (item.image && item.senderId !== item.chatId) {
        try {
          const exists = item.image.startsWith('file://') || item.image.startsWith('/');
          if (exists) {
            if (!cancelled) {
              setThumbBase64(null);
              setThumbLoading(false);
            }
            return;
          }
        } catch {}
      }

      // 2. Check SQLite cached thumb path
      if (item.thumbLocalPath) {
        try {
          const exists = await RNFS.exists(item.thumbLocalPath);
          if (exists && !cancelled) {
            const b64 = await RNFS.readFile(item.thumbLocalPath, 'base64');
            setThumbBase64(b64);
            setThumbLoading(false);
            return;
          }
        } catch {}
      }

      // 3. Download + decrypt thumb from Cloudinary
      if (item.thumbUrl && item.encThumbKey && item.encThumbKeyIv && sharedSecret) {
        const path = ImageEncryptionService.getThumbCachePath(item.id);
        const b64 = await ImageEncryptionService.downloadAndDecrypt(
          item.thumbUrl,
          item.encThumbKey,
          item.encThumbKeyIv,
          sharedSecret,
          path
        );
        if (b64 && !cancelled) {
          LocalDBService.updateImageCache(item.id, path, undefined);
          setThumbBase64(b64);
          setThumbLoading(false);
        } else if (!cancelled) {
          setThumbLoading(false);
        }
      } else if (!cancelled) {
        setThumbLoading(false);
      }
    };

    loadThumb();
    return () => { cancelled = true; };
  }, [item.id, item.thumbLocalPath, item.imageLocalPath]);

  const handleTap = async () => {
    // If full already downloaded (memory or filesystem)
    if (fullBase64) { setFullscreenVisible(true); return; }
    if (isFullyCached) { setFullscreenVisible(true); return; }

    // Check memory local cache again just in case
    if (item.imageLocalPath) {
      try {
        const exists = await RNFS.exists(item.imageLocalPath);
        if (exists) {
          setIsFullyCached(true);
          setFullscreenVisible(true);
          return;
        }
      } catch {}
    }

    // Sender: original URI
    if (isMe && item.image) {
      setFullBase64(null); // will use item.image
      setFullscreenVisible(true);
      return;
    }

    // Download + decrypt full image from Cloudinary
    if (!item.fullUrl || !item.encImgKey || !item.encImgKeyIv || !sharedSecret) {
      Alert.alert('Cannot load image', 'Encryption keys unavailable.');
      return;
    }

    setLoadingFull(true);
    const path = ImageEncryptionService.getFullCachePath(item.id);
    const b64 = await ImageEncryptionService.downloadAndDecrypt(
      item.fullUrl,
      item.encImgKey,
      item.encImgKeyIv,
      sharedSecret,
      path
    );
    setLoadingFull(false);

    if (b64) {
      LocalDBService.updateImageCache(item.id, undefined, path); // Sets SQLite
      // We don't need to load the massive b64 into memory. We can just leverage file URI now!
      setIsFullyCached(true); 
      setFullscreenVisible(true);
    } else {
      Alert.alert('Failed to load image', 'Could not decrypt the image. Please try again.');
    }
  };

  const getThumbSource = () => {
    if (isFullyCached && item.imageLocalPath) return { uri: `file://${item.imageLocalPath}` };
    if (fullBase64) return { uri: `data:image/jpeg;base64,${fullBase64}` };
    if (thumbBase64) return { uri: `data:image/jpeg;base64,${thumbBase64}` };
    if (isMe && item.image) return { uri: item.image };
    return null;
  };

  const getFullSource = () => {
    if (isFullyCached && item.imageLocalPath) return { uri: `file://${item.imageLocalPath}` };
    if (fullBase64) return { uri: `data:image/jpeg;base64,${fullBase64}` };
    if (isMe && item.image) return { uri: item.image };
    return null;
  };

  const thumbSrc = getThumbSource();
  const fullSrc = getFullSource();

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleTap}
        onLongPress={() => onSaveToGallery(item)}
      >
        <View style={[styles.imageBubble, { width: IMAGE_BUBBLE_W, height: bubbleH }]}>
          {thumbLoading ? (
            <ImageShimmer width={IMAGE_BUBBLE_W} height={bubbleH} />
          ) : thumbSrc ? (
            <Image
              source={thumbSrc}
              style={[styles.imagePreview, { width: IMAGE_BUBBLE_W, height: bubbleH }]}
              blurRadius={isFullyCached || fullBase64 || (isMe && item.image) ? 0 : 8}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.imageNoThumb, { width: IMAGE_BUBBLE_W, height: bubbleH }]}>
              <ImageIcon size={40} color="rgba(255,255,255,0.5)" />
            </View>
          )}

          {/* Download / loading overlay */}
          {!thumbLoading && !fullBase64 && !(isMe && item.image) && (
            <View style={styles.downloadOverlay}>
              {loadingFull ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <View style={styles.downloadIcon}>
                  <Download size={20} color="#fff" />
                </View>
              )}
            </View>
          )}
        </View>

        {/* Caption */}
        {!!item.caption && (
          <Text
            style={[
              styles.captionText,
              { color: isMe ? THEME.senderText : THEME.receiverText },
            ]}
          >
            {item.caption}
          </Text>
        )}
      </TouchableOpacity>

      {/* Fullscreen Viewer */}
      <Modal
        visible={fullscreenVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenVisible(false)}
      >
        <View style={styles.fullscreenBg}>
          <TouchableOpacity
            style={styles.fullscreenClose}
            onPress={() => setFullscreenVisible(false)}
          >
            <XIcon size={28} color="#fff" />
          </TouchableOpacity>

          {fullSrc ? (
            <Image
              source={fullSrc}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          ) : (
            <ActivityIndicator color="#fff" size="large" />
          )}

          <TouchableOpacity
            style={styles.saveGalleryBtn}
            onPress={() => {
              setFullscreenVisible(false);
              onSaveToGallery(item);
            }}
          >
            <Download size={18} color="#fff" />
            <Text style={styles.saveGalleryText}>Save to Gallery</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
};

// ─── Chat Screen ─────────────────────────────────────────────────────────────
const ChatScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { contactUid, contactName, contactPhoto } = route.params;
  const { userModelID } = userStore();

  const [messages, setMessages] = useState<CachedMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [chatId, setChatId] = useState('');
  const [recipientKeyMissing, setRecipientKeyMissing] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);
  const [sharedSecret, setSharedSecret] = useState<Uint8Array | null>(null);
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [savingImage, setSavingImage] = useState(false);

  const isSendingRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);

  const refreshMessages = useCallback((targetChatId?: string) => {
    const id = targetChatId || chatId;
    if (!id) return;
    const latest = LocalDBService.getCachedMessages(id, 50);
    setMessages(latest.reverse());
  }, [chatId]);

  useEffect(() => {
    if (!userModelID || !contactUid) return;

    const id = MessageSyncService.getChatId(userModelID, contactUid);
    setChatId(id);
    activeChatId = contactUid;

    MessageSyncService.setActiveMyUid(userModelID);
    MessageSyncService.setActiveChat(id);

    const initialMessages = LocalDBService.getCachedMessages(id, 50);
    setMessages(initialMessages.reverse());
    setLoading(false);

    MessageSyncService.setOnMessageCallback((updatedChatId: string) => {
      if (updatedChatId === id) {
        const updated = LocalDBService.getCachedMessages(id, 50);
        setMessages(updated.reverse());
      }
    });

    const initListener = async () => {
      const pubKey = await EncryptionService.getContactPublicKey(contactUid);
      setRecipientKeyMissing(!pubKey);
      setCheckingKey(false);

      if (pubKey && userModelID) {
        const secret = await EncryptionService.getSharedSecret(userModelID, pubKey);
        setSharedSecret(secret);
        await MessageSyncService.startChatListener(userModelID, contactUid);
      }
    };

    initListener();

    const interval = setInterval(() => {
      const updated = LocalDBService.getCachedMessages(id, 50);
      setMessages(updated.reverse());
    }, 2000);

    return () => {
      activeChatId = null;
      MessageSyncService.setActiveChat(null);
      MessageSyncService.setOnMessageCallback(null);
      clearInterval(interval);
    };
  }, [userModelID, contactUid]);

  // ── Send text ──────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (inputText.trim() === '' || !userModelID || !contactUid || isSendingRef.current) return;
    isSendingRef.current = true;
    const text = inputText.trim();
    setInputText('');

    try {
      await MessageSyncService.sendMessage(userModelID, contactUid, text);
      refreshMessages();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      console.error('[ChatScreen] Send error:', error);
    } finally {
      isSendingRef.current = false;
    }
  };

  // ── Pick & send image ──────────────────────────────────────────────────────
  const handlePickImage = async (fromCamera = false) => {
    setAttachMenuVisible(false);
    if (!userModelID || !contactUid) return;

    const asset = fromCamera
      ? await ImageEncryptionService.pickImageFromCamera()
      : await ImageEncryptionService.pickImageFromGallery();
    if (!asset) return;

    try {
      await MessageSyncService.sendImageMessage(userModelID, contactUid, asset);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (err) {
      console.error('[ChatScreen] Image send error:', err);
      Alert.alert('Send failed', 'Could not send the image. Please try again.');
    }
  };

  // ── Save to gallery ────────────────────────────────────────────────────────
  const handleSaveToGallery = async (item: CachedMessage) => {
    if (savingImage) return;

    // Sender: save original URI
    if (item.senderId === userModelID && item.image) {
      setSavingImage(true);
      try {
        const filename = `chitchat_${item.id}`;
        const dest = `${RNFS.ExternalStorageDirectoryPath}/Pictures/ChitChat/${filename}.jpg`;
        await RNFS.mkdir(`${RNFS.ExternalStorageDirectoryPath}/Pictures/ChitChat`).catch(() => {});
        await RNFS.copyFile(item.image.replace('file://', ''), dest);
        await RNFS.scanFile(dest);
        Alert.alert('Saved!', 'Image saved to ChitChat gallery folder.');
      } catch (err) {
        Alert.alert('Save failed', 'Could not save the image.');
      } finally {
        setSavingImage(false);
      }
      return;
    }

    // Receiver: decrypt full image then save
    if (!sharedSecret || !item.fullUrl || !item.encImgKey || !item.encImgKeyIv) {
      Alert.alert('Cannot save', 'Encryption keys unavailable.');
      return;
    }

    setSavingImage(true);
    try {
      // Try cached path first
      let base64: string | null = null;
      if (item.imageLocalPath) {
        const exists = await RNFS.exists(item.imageLocalPath);
        if (exists) base64 = await RNFS.readFile(item.imageLocalPath, 'base64');
      }

      // Download if not cached
      if (!base64) {
        const path = ImageEncryptionService.getFullCachePath(item.id);
        base64 = await ImageEncryptionService.downloadAndDecrypt(
          item.fullUrl,
          item.encImgKey,
          item.encImgKeyIv,
          sharedSecret,
          path
        );
        if (base64) LocalDBService.updateImageCache(item.id, undefined, path);
      }

      if (!base64) throw new Error('Decryption failed');

      const savedPath = await ImageEncryptionService.saveToGallery(
        base64,
        `chitchat_${item.id}`
      );
      if (savedPath) {
        Alert.alert('Saved! 🎉', 'Image saved to your ChitChat folder in Pictures.');
      } else {
        throw new Error('Save returned null');
      }
    } catch (err) {
      console.error('[ChatScreen] Save to gallery error:', err);
      Alert.alert('Save failed', 'Could not save the image. Please try again.');
    } finally {
      setSavingImage(false);
    }
  };

  // ── Status icon ────────────────────────────────────────────────────────────
  const renderStatus = (status: number) => {
    switch (status) {
      case -1: return <XIcon size={12} color="#ef9a9a" />;
      case 0: return <Clock size={12} color={THEME.timestampSender} />;
      case 1: return <Check size={14} color={THEME.timestampSender} />;
      case 2: return <CheckCheck size={14} color={THEME.timestampSender} />;
      case 3: return <CheckCheck size={14} color="#64b5f6" />;
      default: return null;
    }
  };

  // ── Render message ─────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: CachedMessage }) => {
    const isMe = item.senderId === userModelID;

    if (item.type === 'image') {
      return (
        <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
          <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble, styles.imageBubbleContainer]}>
            <EncryptedImageBubble
              item={item}
              isMe={isMe}
              sharedSecret={sharedSecret}
              onSaveToGallery={handleSaveToGallery}
            />
            <View style={[styles.messageFooter, { paddingHorizontal: 8, paddingBottom: 4 }]}>
              <Text style={[styles.timestamp, { color: isMe ? THEME.timestampSender : THEME.timestampReceiver }]}>
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {isMe && <View style={styles.statusBox}>{renderStatus(item.status)}</View>}
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, { color: isMe ? THEME.senderText : THEME.receiverText }]}>
            {item.text}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[styles.timestamp, { color: isMe ? THEME.timestampSender : THEME.timestampReceiver }]}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isMe && <View style={styles.statusBox}>{renderStatus(item.status)}</View>}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={28} color={THEME.headerText} />
        </TouchableOpacity>

        <Image
          source={contactPhoto ? { uri: contactPhoto } : require('../../../asset/UserLogo.png')}
          style={styles.headerAvatar}
        />

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{contactName}</Text>
          <View style={styles.headerStatusRow}>
            {!checkingKey && !recipientKeyMissing && (
              <Lock size={10} color={THEME.lockBadge} style={{ marginRight: 4 }} />
            )}
            <Text style={styles.headerStatus}>
              {checkingKey
                ? 'Verifying encryption...'
                : recipientKeyMissing
                ? '⚠ Keys not ready'
                : 'End-to-end encrypted'}
            </Text>
          </View>
        </View>

        {/* <CallButton type="audio" contactUid={contactUid} contactName={contactName} contactPhoto={contactPhoto}
          size={21} color={THEME.headerText} style={styles.headerCallBtn} /> */}
          
        <CallButton type="video" contactUid={contactUid} contactName={contactName} contactPhoto={contactPhoto}
          size={21} color={THEME.headerText} style={styles.headerCallBtn} />
{/* 
        <TouchableOpacity style={styles.headerIcon}>
          <MoreVertical size={24} color={THEME.headerText} />
        </TouchableOpacity> */}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={THEME.senderBubble} />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : (
          <>
            {recipientKeyMissing && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningText}>
                  🔒 {contactName} hasn't set up encryption yet. Messages can't be sent until they open the app.
                </Text>
              </View>
            )}

            {!recipientKeyMissing && !checkingKey && messages.length === 0 && (
              <View style={styles.e2eeBanner}>
                <Lock size={16} color="#7986cb" />
                <Text style={styles.e2eeText}>
                  Messages are end-to-end encrypted. No one outside of this chat can read them.
                </Text>
              </View>
            )}

            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}

        {/* Input */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.inputWrapper}>
            <TouchableOpacity style={styles.emojiButton}>
              <Smile size={24} color="#9e9e9e" />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#9e9e9e"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={styles.attachButton}
              onPress={() => setAttachMenuVisible(true)}
            >
              <Paperclip size={22} color="#9e9e9e" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.sendButton, (inputText.trim() === '' || recipientKeyMissing) && styles.disabledSendButton]}
            onPress={handleSend}
            disabled={inputText.trim() === '' || recipientKeyMissing}
            activeOpacity={0.7}
          >
            <Send size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Attach Menu */}
      <Modal
        visible={attachMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.attachOverlay}
          activeOpacity={1}
          onPress={() => setAttachMenuVisible(false)}
        >
          <View style={styles.attachMenu}>
            <Text style={styles.attachTitle}>Send encrypted photo</Text>
            <View style={styles.attachRow}>
              <TouchableOpacity style={styles.attachOption} onPress={() => handlePickImage(false)}>
                <View style={[styles.attachIconCircle, { backgroundColor: '#1565c0' }]}>
                  <ImageIcon size={26} color="#fff" />
                </View>
                <Text style={styles.attachLabel}>Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachOption} onPress={() => handlePickImage(true)}>
                <View style={[styles.attachIconCircle, { backgroundColor: '#388e3c' }]}>
                  <Camera size={26} color="#fff" />
                </View>
                <Text style={styles.attachLabel}>Camera</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.attachNote}>
              🔒 Images are end-to-end encrypted before uploading
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Saving overlay */}
      {savingImage && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.chatBg },
  keyboardView: { flex: 1 },

  // Header
  header: {
    backgroundColor: THEME.headerBg,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8,
    paddingTop: Platform.OS === 'android' ? 25 : 12,
    borderBottomWidth: 1, borderBottomColor: THEME.glassBorder,
  },
  backButton: { padding: 4 },
  headerAvatar: {
    width: 42, height: 42, borderRadius: 21,
    marginLeft: 4, borderWidth: 2, borderColor: 'rgba(245,197,24,0.3)',
  },
  headerInfo: { flex: 1, marginLeft: 12 },
  headerName: { color: THEME.headerText, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  headerStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  headerStatus: { color: THEME.headerSubText, fontSize: 12, fontWeight: '500' },
  headerIcon: { padding: 8 },
  headerCallBtn: {
    padding: 6, marginRight: 2, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: THEME.glassBorder,
  },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: THEME.headerSubText, fontSize: 14 },

  // Messages
  listContent: { paddingVertical: 12, paddingHorizontal: 10, flexGrow: 1, justifyContent: 'flex-end' },
  messageWrapper: { marginBottom: 6, maxWidth: '80%' },
  myMessageWrapper: { alignSelf: 'flex-end' },
  otherMessageWrapper: { alignSelf: 'flex-start' },
  messageBubble: {
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: THEME.glassBorder,
  },
  imageBubbleContainer: { paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' },
  myBubble: { backgroundColor: THEME.senderBubble, borderBottomRightRadius: 4, borderColor: 'rgba(245,197,24,0.3)' },
  otherBubble: { backgroundColor: THEME.receiverBubble, borderBottomLeftRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 22 },
  messageFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: 4,
  },
  timestamp: { fontSize: 11, fontWeight: '500' },
  statusBox: { marginLeft: 4 },

  // Image bubble
  imageBubble: { borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: THEME.glassBorder },
  imagePreview: { borderRadius: 14 },
  imageNoThumb: {
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
  },
  shimmer: { borderRadius: 14, backgroundColor: '#b0bec5' },
  downloadOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  downloadIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  captionText: { fontSize: 14, marginTop: 4, paddingHorizontal: 10, paddingBottom: 6 },

  // Fullscreen viewer
  fullscreenBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  fullscreenClose: { position: 'absolute', top: 48, right: 20, zIndex: 10 },
  fullscreenImage: { width: SCREEN_WIDTH, height: Dimensions.get('window').height * 0.75 },
  saveGalleryBtn: {
    position: 'absolute', bottom: 40,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24,
  },
  saveGalleryText: { color: '#fff', marginLeft: 8, fontSize: 15, fontWeight: '600' },

  // Input
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end',marginBottom : 10,
    paddingHorizontal: 6, paddingVertical: 8, backgroundColor: 'transparent',
  },
  inputWrapper: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: THEME.inputBg, borderRadius: 25,
    paddingHorizontal: 10, marginRight: 6, maxHeight: 120,
    borderWidth: 1, borderColor: THEME.glassBorder,
  },
  emojiButton: { padding: 6 },
  input: { flex: 1, fontSize: 16, paddingVertical: 10, paddingHorizontal: 8, color: '#FFFFFF' },
  attachButton: { padding: 6 },
  sendButton: {
    backgroundColor: THEME.sendBtn, width: 50, height: 50, borderRadius: 25,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: THEME.sendBtn, shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  disabledSendButton: { backgroundColor: THEME.sendBtnDisabled, elevation: 0, shadowOpacity: 0 },

  // Banners
  warningBanner: {
    backgroundColor: THEME.warningBg, padding: 12,
    marginHorizontal: 12, marginTop: 8, borderRadius: 12,
    borderWidth: 1, borderColor: THEME.warningBorder,
  },
  warningText: { color: THEME.warningText, fontSize: 13, textAlign: 'center', fontWeight: '500' },
  e2eeBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,197,24,0.08)', paddingVertical: 10, paddingHorizontal: 20,
    marginHorizontal: 30, marginTop: 20, borderRadius: 10,
    borderWidth: 1, borderColor: THEME.glassBorder,
  },
  e2eeText: { color: THEME.senderText, fontSize: 12, marginLeft: 8, textAlign: 'center', fontWeight: '500' },

  // Attach menu
  attachOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  attachMenu: {
    backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1, borderColor: THEME.glassBorder,
  },
  attachTitle: { fontSize: 16, fontWeight: '700', color: THEME.headerText, marginBottom: 20, textAlign: 'center' },
  attachRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  attachOption: { alignItems: 'center', gap: 8 },
  attachIconCircle: {
    width: 60, height: 60, borderRadius: 30,
    justifyContent: 'center', alignItems: 'center',
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },
  attachLabel: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  attachNote: { textAlign: 'center', fontSize: 12, color: THEME.headerSubText },

  // Saving overlay
  savingOverlay: {
    position: 'absolute', bottom: 80, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  savingText: { color: '#fff', marginLeft: 8, fontSize: 14 },
});

export default ChatScreen;
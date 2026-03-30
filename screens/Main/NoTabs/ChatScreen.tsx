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
import database from '@react-native-firebase/database';
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
  Trash2,
  XCircle,
  Copy,
  Info,
} from 'lucide-react-native';
import MessageSyncService from '../../../services/chat/MessageSyncService';
import LocalDBService, { CachedMessage } from '../../../localDB/LocalDBService';
import EncryptionService from '../../../services/chat/EncryptionService';
import ImageEncryptionService from '../../../services/media/ImageEncryptionService';
import userStore from '../../../store/MyStore';
import CallButton from '../../../components/calling/CallButton';
import RNFS from 'react-native-fs';

export let activeChatId: string | null = null;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUBBLE_MAX_W = SCREEN_WIDTH * 0.72;
const IMAGE_BUBBLE_W = SCREEN_WIDTH * 0.68;

const THEME = {
  headerBg: '#0A0A0A',
  senderBubble: 'rgba(245,197,24,0.15)',
  receiverBubble: 'rgba(255,255,255,0.08)',
  chatBg: '#0A0A0A',
  inputBg: 'rgba(255,255,255,0.08)',
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
  RED: '#FF453A',
};

// ─── Encrypted Image Bubble Component ──────────────────────────────────────────
const EncryptedImageBubble = ({
  item,
  isMe,
  sharedSecret,
  onSaveToGallery,
  onTap,
  onLongPress,
}: any) => {
  const [thumbBase64, setThumbBase64] = useState<string | null>(null);
  const [isFullyCached, setIsFullyCached] = useState(false);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(true);

  const aspectRatio = item.imageWidth && item.imageHeight ? item.imageHeight / item.imageWidth : 1;
  const bubbleH = Math.min(IMAGE_BUBBLE_W * aspectRatio, 380);

  useEffect(() => {
    let cancelled = false;
    const loadThumb = async () => {
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
      if (item.thumbUrl && item.encThumbKey && item.encThumbKeyIv && sharedSecret) {
        const path = ImageEncryptionService.getThumbCachePath(item.id);
        const b64 = await ImageEncryptionService.downloadAndDecrypt(
          item.thumbUrl, item.encThumbKey, item.encThumbKeyIv, sharedSecret, path
        );
        if (b64 && !cancelled) {
          LocalDBService.updateImageCache(item.id, path, undefined);
          setThumbBase64(b64);
          setThumbLoading(false);
        } else if (!cancelled) setThumbLoading(false);
      } else if (!cancelled) setThumbLoading(false);
    };
    loadThumb();
    return () => { cancelled = true; };
  }, [item.id, item.thumbLocalPath, item.imageLocalPath]);

  const handleTap = async () => {
    if (onTap) {
        onTap();
        return;
    }
    if (isFullyCached) { setFullscreenVisible(true); return; }
    if (!item.fullUrl || !item.encImgKey || !item.encImgKeyIv || !sharedSecret) return;

    setLoadingFull(true);
    const path = ImageEncryptionService.getFullCachePath(item.id);
    const b64 = await ImageEncryptionService.downloadAndDecrypt(
      item.fullUrl, item.encImgKey, item.encImgKeyIv, sharedSecret, path
    );
    setLoadingFull(false);
    if (b64) {
      LocalDBService.updateImageCache(item.id, undefined, path);
      setIsFullyCached(true); 
      setFullscreenVisible(true);
    }
  };

  const getSource = () => {
    if (isFullyCached && item.imageLocalPath) return { uri: `file://${item.imageLocalPath}` };
    if (thumbBase64) return { uri: `data:image/jpeg;base64,${thumbBase64}` };
    if (isMe && item.image) return { uri: item.image };
    return null;
  };

  const src = getSource();

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={handleTap} onLongPress={onLongPress}>
        <View style={[styles.imageBubbleContainer, { width: IMAGE_BUBBLE_W, height: bubbleH }]}>
          {thumbLoading ? (
             <View style={{ width: IMAGE_BUBBLE_W, height: bubbleH, backgroundColor: 'rgba(255,255,255,0.05)' }} />
          ) : src ? (
            <Image source={src} style={[styles.imagePreview, { width: IMAGE_BUBBLE_W, height: bubbleH }]} resizeMode="cover" />
          ) : (
            <View style={[styles.imageNoThumb, { width: IMAGE_BUBBLE_W, height: bubbleH }]}>
              <ImageIcon size={40} color="rgba(255,255,255,0.5)" />
            </View>
          )}
          {!isFullyCached && !isMe && !thumbLoading && (
             <View style={styles.downloadOverlay}>{loadingFull ? <ActivityIndicator color="#fff" /> : <Download size={20} color="#fff" />}</View>
          )}
        </View>
        {!!item.caption && <Text style={[styles.captionText, { color: isMe ? THEME.senderText : THEME.receiverText }]}>{item.caption}</Text>}
      </TouchableOpacity>

      <Modal visible={fullscreenVisible} transparent animationType="fade" onRequestClose={() => setFullscreenVisible(false)}>
        <View style={styles.fullscreenBg}>
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenVisible(false)}><XIcon size={28} color="#fff" /></TouchableOpacity>
          {src && <Image source={src} style={styles.fullscreenImage} resizeMode="contain" />}
          <TouchableOpacity style={styles.saveGalleryBtn} onPress={() => { setFullscreenVisible(false); onSaveToGallery(item); }}>
            <Download size={18} color="#fff" /><Text style={styles.saveGalleryText}>Save to Gallery</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
};

// ─── Main Chat Screen ────────────────────────────────────────────────────────
const ChatScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { contactUid, contactName, contactPhoto } = route.params;
  const { userModelID } = userStore();

  // --- Core States ---
  const [messages, setMessages] = useState<CachedMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [chatId, setChatId] = useState('');
  const [sharedSecret, setSharedSecret] = useState<Uint8Array | null>(null);
  const [recipientKeyMissing, setRecipientKeyMissing] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);
  
  // --- UI States ---
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [mainMenuVisible, setMainMenuVisible] = useState(false);
  
  // --- Selection Mode States ---
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const flatListRef = useRef<FlatList>(null);
  const isSendingRef = useRef(false);

  const refreshMessages = useCallback(() => {
    if (!chatId) return;
    const latest = LocalDBService.getCachedMessages(chatId, 100);
    setMessages(latest.reverse());
  }, [chatId]);

  useEffect(() => {
    if (!userModelID || !contactUid) return;
    const cid = MessageSyncService.getChatId(userModelID, contactUid);
    setChatId(cid);
    
    // Set active chat using full chatId (sorted UIDs)
    MessageSyncService.setActiveChat(cid);

    const msgs = LocalDBService.getCachedMessages(cid, 100);
    setMessages(msgs.reverse());
    setLoading(false);

    const init = async () => {
      const pubKey = await EncryptionService.getContactPublicKey(contactUid);
      setRecipientKeyMissing(!pubKey);
      setCheckingKey(false);
      if (pubKey) {
        const secret = await EncryptionService.getSharedSecret(userModelID, pubKey);
        setSharedSecret(secret);
        await MessageSyncService.startChatListener(userModelID, contactUid);
      }
    };
    init();

    // Re-active sync callback instead of setInterval polling
    MessageSyncService.setOnMessageCallback((incomingChatId) => {
        if (incomingChatId === cid) {
            refreshMessages();
        }
    });

    return () => {
      MessageSyncService.setActiveChat(null);
      MessageSyncService.setOnMessageCallback(null);
    };
  }, [userModelID, contactUid, refreshMessages]);

  // ─── Selection Mode Logic ──────────────────────────────────────────────────
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
      const newSelected = new Set<string>();
      newSelected.add(id);
      setSelectedIds(newSelected);
    }
  };

  const deleteFilesForMessages = async (ids: string[]) => {
    try {
      const msgs = LocalDBService.getMessagesByIds(ids);
      for (const msg of msgs) {
        if (msg.imageLocalPath) await RNFS.unlink(msg.imageLocalPath).catch(() => {});
        if (msg.thumbLocalPath) await RNFS.unlink(msg.thumbLocalPath).catch(() => {});
      }
    } catch (e) {
      console.log('[Cleanup] Error deleting files:', e);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Alert.alert(
      "Delete Messages",
      `Delete ${count} message${count > 1 ? 's' : ''} for yourself? Files will also be cleaned up.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            const idsArray = Array.from(selectedIds);
            await deleteFilesForMessages(idsArray);
            
            // Delete from SQLite and automatically update contact last message
            LocalDBService.deleteMessages(idsArray, contactUid);

            setIsSelectionMode(false);
            setSelectedIds(new Set());
            refreshMessages();

            // Refresh Inbox UI
            if (MessageSyncService.onInboxUpdatedCallback) {
                MessageSyncService.onInboxUpdatedCallback();
            }
          } 
        }
      ]
    );
  };

  const handleClearChat = () => {
    setMainMenuVisible(false);
    Alert.alert(
       "Clear Chat",
       "Delete all messages in this conversation property including image cache?",
       [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Clear All", 
            style: "destructive", 
            onPress: async () => {
               const allMsgs = LocalDBService.getCachedMessages(chatId, 1000);
               const allIds = allMsgs.map(m => m.id);
               await deleteFilesForMessages(allIds);
               LocalDBService.deleteMessagesForChat(chatId);
               
               // Clear Inbox and Set Wipe Stamp
               LocalDBService.markChatAsDeleted(contactUid);
               
               if (MessageSyncService.onInboxUpdatedCallback) {
                  MessageSyncService.onInboxUpdatedCallback();
               }

               refreshMessages();
            } 
          }
       ]
    );
  };

  // ─── Messaging Logic ───────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const text = inputText.trim();
    setInputText(''); // Clear input instantly for snappy feel
    
    // ── True Optimistic UI: Pre-generate data and save to SQLite instantly ──
    const id = database().ref(`messages/${chatId}`).push().key!;
    const timestamp = Date.now();
    
    LocalDBService.saveMessage({
      id,
      chatId,
      senderId: userModelID!,
      text,
      image: null,
      timestamp,
      status: 0, // Pending
    });
    
    refreshMessages(); // Sync UI with optimistic local record

    // Fire off encryption/sync in background without awaiting
    MessageSyncService.sendMessage(userModelID!, contactUid, text, id, timestamp)
      .then(() => {
        refreshMessages(); // Refresh to update status from 0 to 1
      })
      .catch(err => {
        console.error('[ChatScreen] Send failed:', err);
      });

    // Scroll to end almost instantly
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 30);
  };

  const handlePickImage = async (camera: boolean) => {
    setAttachMenuVisible(false);
    const asset = camera ? await ImageEncryptionService.pickImageFromCamera() : await ImageEncryptionService.pickImageFromGallery();
    if (!asset) return;
    try {
      await MessageSyncService.sendImageMessage(userModelID!, contactUid, asset);
      setTimeout(() => flatListRef.current?.scrollToEnd(), 200);
    } catch (err) { Alert.alert('Fail', 'Image send failed'); }
  };

  const handleSaveToGallery = async (item: CachedMessage) => {
    setSavingImage(true);
    try {
        let base64: string | null = null;
        if (item.imageLocalPath && await RNFS.exists(item.imageLocalPath)) base64 = await RNFS.readFile(item.imageLocalPath, 'base64');
        else if (item.fullUrl && item.encImgKey && sharedSecret) {
             const path = ImageEncryptionService.getFullCachePath(item.id);
             base64 = await ImageEncryptionService.downloadAndDecrypt(item.fullUrl, item.encImgKey, item.encImgKeyIv!, sharedSecret, path);
             if (base64) LocalDBService.updateImageCache(item.id, undefined, path);
        }
        if (base64) await ImageEncryptionService.saveToGallery(base64, `cc_${item.id}`);
    } catch (e) { Alert.alert('Error', 'Save failed'); }
    finally { setSavingImage(false); }
  };

  const renderStatus = (s: number) => {
    if (s === 0) return <Clock size={12} color={THEME.timestampSender} />;
    if (s === 1) return <Check size={14} color={THEME.timestampSender} />;
    if (s === 2) return <CheckCheck size={14} color={THEME.timestampSender} />;
    if (s === 3) return <CheckCheck size={14} color="#64b5f6" />;
    return null;
  };

  const renderMessage = ({ item }: { item: CachedMessage }) => {
    const isMe = item.senderId === userModelID;
    const isSelected = selectedIds.has(item.id);

    return (
      <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
        <TouchableOpacity 
          activeOpacity={0.9} 
          onPress={() => isSelectionMode ? toggleSelection(item.id) : null}
          onLongPress={() => handleLongPress(item.id)}
          style={[
            styles.messageBubble, 
            isMe ? styles.myBubble : styles.otherBubble, 
            item.type === 'image' && styles.imageBubbleContainer,
            isSelected && styles.selectedBubble
          ]}
        >
          {/* Selection Dot */}
          {isSelectionMode && (
             <View style={styles.selectionDotContainer}>
               <View style={[styles.selectionDot, isSelected && styles.selectionDotActive]}>
                 {isSelected && <Check size={10} color="#fff" />}
               </View>
             </View>
          )}

          {item.type === 'image' ? (
            <EncryptedImageBubble 
               item={item} isMe={isMe} sharedSecret={sharedSecret} 
               onSaveToGallery={handleSaveToGallery} 
               onTap={isSelectionMode ? () => toggleSelection(item.id) : null}
               onLongPress={() => handleLongPress(item.id)}
            />
          ) : (
            <Text style={[styles.messageText, { color: isMe ? THEME.senderText : THEME.receiverText }]}>{item.text}</Text>
          )}
          
          <View style={styles.messageFooter}>
            <Text style={[styles.timestamp, { color: isMe ? THEME.timestampSender : THEME.timestampReceiver }]}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isMe && <View style={styles.statusBox}>{renderStatus(item.status)}</View>}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      {/* Dynamic Header */}
      <View style={[styles.header, isSelectionMode && styles.selectionHeader]}>
        {isSelectionMode ? (
           <>
             <TouchableOpacity onPress={() => setIsSelectionMode(false)} style={styles.headerIcon}><XCircle size={26} color="#fff" /></TouchableOpacity>
             <Text style={styles.headerSelectionCount}>{selectedIds.size} Selected</Text>
             <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={handleDeleteSelected} style={styles.headerIcon}><Trash2 size={24} color={THEME.RED} /></TouchableOpacity>
             </View>
           </>
        ) : (
           <>
             <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><ChevronLeft size={28} color="#fff" /></TouchableOpacity>
             <Image source={contactPhoto ? { uri: contactPhoto } : require('../../../asset/UserLogo.png')} style={styles.headerAvatar} />
             <View style={styles.headerInfo}>
               <Text style={styles.headerName} numberOfLines={1}>{contactName}</Text>
               <Text style={styles.headerStatus}>{!checkingKey && !recipientKeyMissing ? 'End-to-end encrypted' : 'Verifying keys...'}</Text>
             </View>
             <CallButton type="video" contactUid={contactUid} contactName={contactName} contactPhoto={contactPhoto} size={21} color="#fff" style={styles.headerCallBtn} />
             <TouchableOpacity onPress={() => setMainMenuVisible(true)} style={styles.headerIcon}><MoreVertical size={24} color="#fff" /></TouchableOpacity>
           </>
        )}
      </View>

      {/* Main UI */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {loading ? <ActivityIndicator style={{ flex: 1 }} /> : (
            <FlatList
              ref={flatListRef} data={messages} renderItem={renderMessage} keyExtractor={m => m.id}
              contentContainerStyle={styles.listContent} inverted={false}
              onContentSizeChange={() => !isSelectionMode && flatListRef.current?.scrollToEnd({ animated: false })}
              showsVerticalScrollIndicator={false}
            />
        )}

        {/* Input area */}
        {!isSelectionMode && (
          <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} placeholder="Encrypt message..." placeholderTextColor="#9e9e9e" value={inputText} onChangeText={setInputText} multiline />
              <TouchableOpacity style={{ padding: 8 }} onPress={() => setAttachMenuVisible(true)}><Paperclip size={24} color="#9e9e9e" /></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={!inputText.trim()}><Send size={22} color="#fff" /></TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Menus */}
      <Modal visible={mainMenuVisible} transparent animationType="fade" onRequestClose={() => setMainMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMainMenuVisible(false)}>
          <View style={styles.menuContent}>
            <TouchableOpacity style={styles.menuOption} onPress={handleClearChat}><Trash2 size={18} color="#ff3b30" /><Text style={[styles.menuText, { color: '#ff3b30' }]}>Clear Chat</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuOption} onPress={() => setMainMenuVisible(false)}><Info size={18} color="#fff" /><Text style={styles.menuText}>Contact Info</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={attachMenuVisible} transparent animationType="slide" onRequestClose={() => setAttachMenuVisible(false)}>
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setAttachMenuVisible(false)}>
          <View style={styles.attachMenu}>
            <Text style={styles.attachTitle}>Send Encrypted Image</Text>
            <View style={styles.attachRow}>
              <TouchableOpacity style={styles.attachOption} onPress={() => handlePickImage(false)}><View style={[styles.attachIconCircle, { backgroundColor: '#1565c0' }]}><ImageIcon color="#fff" /></View><Text style={styles.attachLabel}>Library</Text></TouchableOpacity>
              <TouchableOpacity style={styles.attachOption} onPress={() => handlePickImage(true)}><View style={[styles.attachIconCircle, { backgroundColor: '#388e3c' }]}><Camera color="#fff" /></View><Text style={styles.attachLabel}>Camera</Text></TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {savingImage && <View style={styles.savingOverlay}><ActivityIndicator color="#fff" /><Text style={{ color: '#fff', marginLeft: 10 }}>Cleaning up files...</Text></View>}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.chatBg },
  header: {
    backgroundColor: THEME.headerBg, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: THEME.glassBorder,
    paddingTop: Platform.OS === 'android' ? 20 : 12,
  },
  selectionHeader: { backgroundColor: '#1a1a1a' },
  headerSelectionCount: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 10 },
  backButton: { padding: 4 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, marginLeft: 8 },
  headerInfo: { flex: 1, marginLeft: 12 },
  headerName: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerStatus: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  headerIcon: { padding: 8 },
  headerCallBtn: { padding: 8, marginRight: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },

  listContent: { paddingVertical: 15, paddingHorizontal: 10 },
  messageWrapper: { marginBottom: 8 },
  myMessageWrapper: { alignSelf: 'flex-end' },
  otherMessageWrapper: { alignSelf: 'flex-start' },
  messageBubble: { 
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, maxWidth: SCREEN_WIDTH * 0.75,
    borderWidth: 1, borderColor: THEME.glassBorder,
  },
  selectedBubble: { backgroundColor: 'rgba(245,197,24,0.3)', borderColor: '#F5C518' },
  myBubble: { backgroundColor: THEME.senderBubble, borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: THEME.receiverBubble, borderBottomLeftRadius: 4 },
  
  selectionDotContainer: { position: 'absolute', top: -6, left: -6, zIndex: 10 },
  selectionDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#333', borderWidth: 1, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  selectionDotActive: { backgroundColor: '#F5C518', borderColor: '#F5C518' },

  messageText: { fontSize: 16, lineHeight: 22 },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  timestamp: { fontSize: 10 },
  statusBox: { marginLeft: 4 },

  imageBubbleContainer: { padding: 0, overflow: 'hidden' },
  imagePreview: { borderRadius: 20 },
  imageNoThumb: { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  downloadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  captionText: { padding: 10, fontSize: 14 },

  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, gap: 8 , marginBottom :  10},
  inputWrapper: { flex: 1, borderRadius: 25, backgroundColor: THEME.inputBg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  input: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 8, maxHeight: 100 },
  sendButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: THEME.sendBtn, alignItems: 'center', justifyContent: 'center' },

  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  menuContent: { position: 'absolute', top: 60, right: 10, backgroundColor: '#1c1c1e', borderRadius: 12, padding: 8, minWidth: 160 },
  menuOption: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  menuText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  attachOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  attachMenu: { backgroundColor: '#1c1c1e', padding: 25, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  attachTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  attachRow: { flexDirection: 'row', justifyContent: 'space-around' },
  attachOption: { alignItems: 'center' },
  attachIconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  attachLabel: { color: '#efeff4', fontSize: 13 },

  fullscreenBg: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  fullscreenClose: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  fullscreenImage: { width: '100%', height: '80%' },
  saveGalleryBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 20 },
  saveGalleryText: { color: '#fff', fontWeight: 'bold' },

  savingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
});

export default ChatScreen;
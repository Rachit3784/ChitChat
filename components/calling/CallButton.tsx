/**
 * CallButton.tsx
 * Reusable call button — video or voice.
 * Used in: HomeScreen contact rows, ChatScreen header, CallScreen logs.
 */
import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, Alert } from 'react-native';
import { Video, Phone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import CallManageService from '../../services/calling/CallManageService';
import userStore from '../../store/MyStore';

interface CallButtonProps {
  type: 'video' | 'audio';
  contactUid: string;
  contactName: string;
  contactPhoto?: string | null;
  size?: number;
  color?: string;
  style?: ViewStyle;
}

const CallButton: React.FC<CallButtonProps> = ({
  type,
  contactUid,
  contactName,
  contactPhoto,
  size = 22,
  color = '#1565c0',
  style,
}) => {
  const navigation = useNavigation<any>();
  const { userModelID, userName, isBusy } = userStore();

  const handlePress = async () => {
    if (isBusy) return;
    // Phase 1: Call Initiation (Service will handle UI transition)
    const res = (await CallManageService.initiateCall(
      { id: userModelID, name: userName },
      contactUid,
      contactName,
      (contactPhoto || null) as any,
      type
    )) as any;

    if (!res.success) {
      Alert.alert('Call Failed', res.message || 'Check your connection');
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={isBusy}
      style={[styles.btn, style, isBusy && { opacity: 0.5 }]}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {type === 'video' ? (
        <Video size={size} color={color} />
      ) : (
        <Phone size={size} color={color} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    padding: 6,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CallButton;


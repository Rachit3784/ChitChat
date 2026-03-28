/**
 * CallButton.tsx
 * Reusable call button — video or voice.
 * Used in: HomeScreen contact rows, ChatScreen header, CallScreen logs.
 */
import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Video, Phone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

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

  const handlePress = () => {
    navigation.navigate('Screens', {
      screen: 'OutgoingCallScreen',
      params: {
        contactUid,
        contactName,
        contactPhoto: contactPhoto || null,
        callType: type,
      },
    });
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.btn, style]}
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

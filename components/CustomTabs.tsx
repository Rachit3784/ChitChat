import React from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, Focus, PhoneIcon, CircleUser } from "lucide-react-native";

const { width } = Dimensions.get("window");

// ── Design Tokens ─────────────────────────────────────────────────────────────
const G = {
  BLACK: "#0A0A0A",
  GOLD: "#F5C518",
  GOLD_DIM: "rgba(245,197,24,0.18)",
  GLASS: "rgba(22,22,22,0.96)",
  BORDER: "rgba(255,255,255,0.12)",
  ICON_ACTIVE: "#F5C518",
  ICON_INACTIVE: "rgba(255,255,255,0.40)",
  LABEL_ACTIVE: "#F5C518",
  LABEL_INACTIVE: "rgba(255,255,255,0.40)",
};

const tabConfig = {
  Home: {
    label: "Chats",
    Icon: Home,
  },
  Status: {
    label: "Status",
    Icon: Focus,
  },
  Call: {
    label: "Calls",
    Icon: PhoneIcon,
  },
  Profile: {
    label: "Profile",
    Icon: CircleUser,
  },
};

function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.outerWrapper, { paddingBottom: insets.bottom || 8 }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const config = tabConfig[route.name];
          if (!config) return null;

          const isFocused = state.index === index;
          const { Icon, label } = config;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tabButton}
              activeOpacity={0.75}
            >
              <View style={[styles.tabInner, isFocused && styles.tabInnerActive]}>
                <Icon
                  size={22}
                  color={isFocused ? G.ICON_ACTIVE : G.ICON_INACTIVE}
                  strokeWidth={isFocused ? 2.2 : 1.8}
                />
                <Text
                  style={[
                    styles.label,
                    { color: isFocused ? G.LABEL_ACTIVE : G.LABEL_INACTIVE },
                    isFocused && styles.labelActive,
                  ]}
                >
                  {label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default CustomTabBar;

const styles = StyleSheet.create({
  outerWrapper: {
    position: "absolute",
    bottom: 7,
    left: 0,
    right: 0,
    alignItems: "center",
    // Subtle gradient-like outer glow
    paddingTop: 8,
  },

  // Floating frosted-glass pill
  pill: {
    flexDirection: "row",
    backgroundColor: G.GLASS,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: G.BORDER,
    paddingHorizontal: 6,
    paddingVertical: 6,
    width: width - 32,
    justifyContent: "space-around",
    alignItems: "center",
    // Shadow cascade for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },

  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },

  tabInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
   
    gap: 3,
    minWidth: 60,
  },

  tabInnerActive: {
    backgroundColor: G.GOLD_DIM,
    borderWidth: 1,
    borderRadius: 50,
    borderColor: "rgba(245,197,24,0.22)",
  },

  label: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
    marginTop: 1,
  },

  labelActive: {
    fontWeight: "700",
  },
});
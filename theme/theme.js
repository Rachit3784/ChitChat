// theme/theme.js — iOS Glassmorphism Style Helpers
import { useColorScheme } from 'react-native';
import { colors } from './color';

export const useCustomTheme = () => {
  // Force dark / glass theme always — it's the design intent
  const isDarkMode = true;

  return {
    isDarkMode,
    colors: {
      ...colors,
      background: colors.background,
      surface: colors.backgroundSurface,
      text: colors.text,
      textSecondary: colors.textSecondary,
      border: colors.glassBorder,
      card: colors.glass,
      primary: colors.primary,
      white: colors.white,
    },

    styles: {
      // ── Glass Card ─────────────────────────────
      glassCard: {
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
      },

      // ── Glass Surface (slightly stronger) ──────
      glassSurface: {
        backgroundColor: colors.glassStrong,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        borderRadius: 16,
      },

      // ── Glass Header ───────────────────────────
      glassHeader: {
        backgroundColor: 'rgba(10,10,10,0.92)',
        borderBottomWidth: 1,
        borderBottomColor: colors.glassBorder,
      },

      // ── Gold Accent Card ───────────────────────
      glassGoldCard: {
        backgroundColor: colors.glassGold,
        borderWidth: 1,
        borderColor: colors.glassGoldBorder,
        borderRadius: 20,
      },

      // ── Standard shadow ────────────────────────
      cardShadow: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.30,
        shadowRadius: 12,
        elevation: 6,
      },

      borderRadius: 20,
    },
  };
};
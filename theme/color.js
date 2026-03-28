// theme/color.js — iOS Glassmorphism Palette
// Black x Glassy Gray x Warm Gold — No neon

export const colors = {
  // ── Core Brand ──────────────────────────────────────────────
  primary: '#F5C518',        // Warm Gold (main accent)
  primaryDeep: '#D4A017',    // Deeper Gold for pressed states
  primaryLight: '#FACC15',   // Bright Gold highlight

  // ── Background Layers ───────────────────────────────────────
  background: '#0A0A0A',     // Near-black
  backgroundMid: '#111111',  // Slightly lighter dark
  backgroundSurface: '#1A1A1A', // Card/surface dark

  // ── Glassmorphism ───────────────────────────────────────────
  glass: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.13)',
  glassStrong: 'rgba(255,255,255,0.12)',
  glassMedium: 'rgba(255,255,255,0.09)',
  glassWeak: 'rgba(255,255,255,0.05)',

  // Gold glass tint
  glassGold: 'rgba(245,197,24,0.12)',
  glassGoldBorder: 'rgba(245,197,24,0.30)',

  // ── Typography ──────────────────────────────────────────────
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.35)',
  textGold: '#F5C518',

  // ── Status Colors (iOS-style) ────────────────────────────────
  success: '#30D158',         // iOS Green
  error: '#FF453A',           // iOS Red
  warning: '#FF9F0A',         // iOS Orange

  // ── Utility ─────────────────────────────────────────────────
  white: '#FFFFFF',
  black: '#000000',
  separator: 'rgba(255,255,255,0.10)',

  // Legacy compat (used by older screens importing colors.light / colors.dark)
  light: {
    background: '#0A0A0A',
    surface: '#1A1A1A',
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.60)',
    border: 'rgba(255,255,255,0.13)',
    card: 'rgba(255,255,255,0.07)',
  },
  dark: {
    background: '#000000',
    surface: '#111111',
    text: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.60)',
    border: 'rgba(255,255,255,0.10)',
    card: 'rgba(255,255,255,0.05)',
  },

  // Legacy — kept for backward compat
  secondary: '#D4A017',
  accent: '#F5C518',
};
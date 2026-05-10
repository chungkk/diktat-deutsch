// Design tokens for Shadowing DE
// Inspired by the existing web app's dark premium aesthetic

export const Colors = {
  // Backgrounds
  bg: '#0A0A0A',
  bgCard: '#141414',
  bgCardHover: '#1A1A1A',
  bgSurface: '#1E1E1E',
  bgInput: '#252525',

  // Brand / Accents
  accent: '#A855F7',       // purple
  accentLight: '#C084FC',
  accentDim: 'rgba(168, 85, 247, 0.15)',
  success: '#22C55E',
  successDim: 'rgba(34, 197, 94, 0.15)',
  error: '#EF4444',
  errorDim: 'rgba(239, 68, 68, 0.15)',
  warning: '#F59E0B',

  // German flag colors
  germanBlack: '#000000',
  germanRed: '#DD0000',
  germanGold: '#FFCC00',

  // Text
  textPrimary: '#F5F5F5',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  textInverse: '#0A0A0A',

  // Borders
  border: '#2A2A2A',
  borderLight: '#3A3A3A',

  // Level colors
  levelA1: '#00B894',
  levelA2: '#00CEC9',
  levelB1: '#6C5CE7',
  levelB2: '#A855F7',
  levelC1: '#FD79A8',
  levelC2: '#E17055',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',
};

export const Fonts = {
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};

export const LEVEL_COLORS: Record<string, string> = {
  A1: Colors.levelA1,
  A2: Colors.levelA2,
  B1: Colors.levelB1,
  B2: Colors.levelB2,
  C1: Colors.levelC1,
  C2: Colors.levelC2,
};

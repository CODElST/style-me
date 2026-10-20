// StyleMe design tokens — warm, wardrobe-inspired neutrals with a clay accent.

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#231D16',
    textSecondary: '#8A7E72',
    background: '#F5F1EA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EBE3D7',
    // brand
    accent: '#A85432',
    accentSoft: '#F3E2D8',
    hairline: '#E3DACC',
    subtleFill: '#EFEAE1',
    danger: '#B0413A',
    positive: '#5F7351',
  },
  dark: {
    text: '#F4EFE7',
    textSecondary: '#A99D90',
    background: '#16120E',
    backgroundElement: '#241D17',
    backgroundSelected: '#332A22',
    // brand
    accent: '#E08B5B',
    accentSoft: '#3A2A1F',
    hairline: '#3A3128',
    subtleFill: '#241D17',
    danger: '#D96B63',
    positive: '#93A97F',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 22,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

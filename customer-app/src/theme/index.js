/**
 * theme/index.js — Zesto design system for the Rider App
 * Mirrors the Zesto web admin CSS variables exactly.
 */

export const Colors = {
  // Brand
  orange:       '#FF6B2C',
  orangeDark:   '#E85520',
  orangePale:   '#FFF0E8',

  // Dark sidebar (used for auth screens)
  dark:         '#1A1A2E',
  darkCard:     '#16213E',
  darkBorder:   'rgba(255,255,255,0.1)',

  // Backgrounds
  bg:           '#F4F6FA',
  surface:      '#FFFFFF',

  // Text
  text:         '#1A1A2E',
  textSec:      '#6B7280',
  textMuted:    '#9CA3AF',
  textOnDark:   'rgba(255,255,255,0.92)',
  textOnDarkSec:'rgba(255,255,255,0.6)',

  // Semantic
  success:      '#22c55e',
  successBg:    '#f0fdf4',
  successDark:  '#15803d',
  danger:       '#ef4444',
  dangerBg:     '#fef2f2',
  warning:      '#f59e0b',
  warningBg:    '#fffbeb',
  info:         '#3b82f6',
  infoBg:       '#eff6ff',

  // UI
  border:       '#E8EAF0',
  overlay:      'rgba(0,0,0,0.55)',
  mapOverlay:   'rgba(26,26,46,0.85)',
};

export const Typography = {
  xs:       11,
  sm:       13,
  base:     15,
  md:       17,
  lg:       20,
  xl:       24,
  xxl:      30,
  xxxl:     38,

  regular:  '400',
  medium:   '500',
  semibold: '600',
  bold:     '700',
  extrabold:'800',
  black:    '900',
};

export const Spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  base: 16,
  lg:   20,
  xl:   24,
  xxl:  32,
  xxxl: 48,
};

export const Radius = {
  xs:   6,
  sm:   10,
  md:   14,
  lg:   20,
  xl:   28,
  full: 999,
};

export const Shadows = {
  xs: { shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.06, shadowRadius:2, elevation:1 },
  sm: { shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.08, shadowRadius:4, elevation:2 },
  md: { shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.10, shadowRadius:10, elevation:4 },
  lg: { shadowColor:'#000', shadowOffset:{width:0,height:8}, shadowOpacity:0.14, shadowRadius:20, elevation:8 },
  xl: { shadowColor:'#000', shadowOffset:{width:0,height:16}, shadowOpacity:0.18, shadowRadius:32, elevation:12 },
  orange: { shadowColor:'#FF6B2C', shadowOffset:{width:0,height:4}, shadowOpacity:0.35, shadowRadius:10, elevation:6 },
};

export const CategoryIcons = {
  food:    '🍔',
  drink:   '🥤',
  dessert: '🍰',
  other:   '🍱',
};

export const StatusColors = {
  pending:          { bg:'#fff7ed', text:'#c2410c', dot:'#f97316' },
  processing:       { bg:'#eff6ff', text:'#1d4ed8', dot:'#3b82f6' },
  preparing:        { bg:'#fdf4ff', text:'#7e22ce', dot:'#a855f7' },
  ready_for_pickup: { bg:'#f0fdf4', text:'#15803d', dot:'#22c55e' },
  out_for_delivery: { bg:'#fff7ed', text:'#c2410c', dot:'#FF6B2C' },
  delivered:        { bg:'#f0fdf4', text:'#15803d', dot:'#22c55e' },
  cancelled:        { bg:'#fef2f2', text:'#b91c1c', dot:'#ef4444' },
  assigned:         { bg:'#fff7ed', text:'#c2410c', dot:'#FF6B2C' },
  picked_up:        { bg:'#eff6ff', text:'#1d4ed8', dot:'#3b82f6' },
  on_the_way:       { bg:'#fff7ed', text:'#c2410c', dot:'#FF6B2C' },
};

/**
 * components/index.js — Zesto Customer shared UI components
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, Image,
  StyleSheet, Platform,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows, StatusColors } from '../theme';

// ── ZestoBrand ────────────────────────────────────────────────────
export function ZestoBrand({ size = 'md', light = false }) {
  const sizes = { sm: 22, md: 28, lg: 38, xl: 48 };
  const fs = sizes[size] || 28;
  const base = light ? '#fff' : Colors.dark;
  return (
    <Text style={{ fontWeight: '900', fontSize: fs, color: base, letterSpacing: -0.5 }}>
      Zes<Text style={{ color: Colors.orange }}>to</Text>
    </Text>
  );
}

// ── Button ────────────────────────────────────────────────────────
export function Button({
  title, onPress, loading = false, disabled = false,
  variant = 'primary', size = 'md', icon, style, textStyle,
}) {
  const isDisabled = disabled || loading;

  const bgMap = {
    primary: isDisabled ? '#C4C4C4' : Colors.orange,
    success: isDisabled ? '#C4C4C4' : Colors.success,
    danger: isDisabled ? '#C4C4C4' : Colors.danger,
    outline: 'transparent',
    ghost: 'transparent',
    dark: Colors.dark,
  };
  const textMap = {
    primary: '#fff', success: '#fff', danger: '#fff',
    outline: Colors.orange, ghost: Colors.text, dark: '#fff',
  };
  const pd = {
    sm: { paddingVertical: 9, paddingHorizontal: 18 },
    md: { paddingVertical: 14, paddingHorizontal: 24 },
    lg: { paddingVertical: 17, paddingHorizontal: 28 },
  }[size] || { paddingVertical: 14, paddingHorizontal: 24 };
  const fs = { sm: Typography.sm, md: Typography.base, lg: Typography.md }[size] || Typography.base;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.82}
      style={[
        styles.btn, pd,
        { backgroundColor: bgMap[variant] || bgMap.primary },
        variant === 'outline' && { borderWidth: 2, borderColor: Colors.orange },
        (variant === 'primary' || variant === 'dark') && !isDisabled && Shadows.orange,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textMap[variant]} size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Text style={{ fontSize: fs + 2 }}>{icon}</Text> : null}
          <Text style={[styles.btnText, { color: textMap[variant] || '#fff', fontSize: fs }, textStyle]}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Card ──────────────────────────────────────────────────────────
export function Card({ children, style, onPress, shadow = 'sm' }) {
  const El = onPress ? TouchableOpacity : View;
  return (
    <El onPress={onPress} activeOpacity={0.93} style={[styles.card, Shadows[shadow], style]}>
      {children}
    </El>
  );
}

// ── StatusPill ────────────────────────────────────────────────────
export function StatusPill({ status }) {
  const c = StatusColors[status] || { bg: Colors.bg, text: Colors.textSec, dot: Colors.textMuted };
  const label = ({
    pending: 'Order Placed', processing: 'Confirmed', preparing: 'Preparing',
    ready_for_pickup: 'Ready for Pickup', out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered', cancelled: 'Cancelled',
  })[status] || (status || '').replace(/_/g, ' ');
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: c.dot }]} />
      <Text style={[styles.pillText, { color: c.text }]}>{label}</Text>
    </View>
  );
}

// ── QuantityStepper ───────────────────────────────────────────────
export function QuantityStepper({ qty, onIncrease, onDecrease, size = 'md' }) {
  const dim = size === 'sm' ? 28 : 34;
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        onPress={onDecrease}
        style={[styles.stepperBtn, { width: dim, height: dim }]}
        activeOpacity={0.7}
      >
        <Text style={styles.stepperBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepperQty}>{qty}</Text>
      <TouchableOpacity
        onPress={onIncrease}
        style={[styles.stepperBtn, styles.stepperBtnActive, { width: dim, height: dim }]}
        activeOpacity={0.7}
      >
        <Text style={[styles.stepperBtnText, { color: '#fff' }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── LoadingScreen ─────────────────────────────────────────────────
export function LoadingScreen({ message = 'Loading…' }) {
  return (
    <View style={styles.center}>
      <ZestoBrand size="lg" />
      <ActivityIndicator size="large" color={Colors.orange} style={{ marginTop: 24 }} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

// ── EmptyState ────────────────────────────────────────────────────
export function EmptyState({ icon = '📭', title, subtitle, action }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      {title && <Text style={styles.emptyTitle}>{title}</Text>}
      {subtitle && <Text style={styles.emptySub}>{subtitle}</Text>}
      {action}
    </View>
  );
}

// ── InfoRow ───────────────────────────────────────────────────────
export function InfoRow({ label, value, icon, mono = false }) {
  if (!value && value !== 0) return null;
  return (
    <View style={styles.infoRow}>
      {icon ? <Text style={styles.infoIcon}>{icon}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, mono && { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 1 }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ── Avatar (falls back to initials) ─────────────────────────────
export function Avatar({ uri, name, size = 44 }) {
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.border }} />;
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: Colors.orangePale, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: Colors.orangeDark, fontWeight: Typography.bold, fontSize: size / 2.6 }}>{initials}</Text>
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────────
export function Badge({ count }) {
  if (!count) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontWeight: Typography.bold },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.base },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full, alignSelf: 'flex-start',
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: Typography.xs, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBtn: {
    borderRadius: Radius.sm, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnActive: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  stepperBtnText: { fontSize: 18, fontWeight: Typography.bold, color: Colors.text },
  stepperQty: { minWidth: 22, textAlign: 'center', fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, padding: Spacing.xl },
  loadingText: { marginTop: 14, color: Colors.textSec, fontSize: Typography.base },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  emptyIcon: { fontSize: 56, marginBottom: Spacing.md },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.text, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: Typography.base, color: Colors.textSec, textAlign: 'center', marginBottom: Spacing.lg, lineHeight: 21 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  infoIcon: { fontSize: 18, marginTop: 1 },
  infoLabel: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: Typography.base, color: Colors.text, fontWeight: Typography.medium },
  badge: {
    position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 2, borderColor: Colors.surface,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: Typography.bold },
});

/**
 * components/index.js — Zesto Rider shared UI components
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Animated, Platform,
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

// ── RiderChip ─────────────────────────────────────────────────────
export function RiderChip() {
  return (
    <View style={styles.riderChip}>
      <View style={styles.riderChipDot} />
      <Text style={styles.riderChipText}>RIDER</Text>
    </View>
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
    danger:  isDisabled ? '#C4C4C4' : Colors.danger,
    outline: 'transparent',
    ghost:   'transparent',
    dark:    Colors.dark,
  };
  const textMap = {
    primary: '#fff', success: '#fff', danger: '#fff',
    outline: Colors.orange, ghost: Colors.text, dark: '#fff',
  };
  const pd = {
    sm:  { paddingVertical: 9,  paddingHorizontal: 18 },
    md:  { paddingVertical: 14, paddingHorizontal: 24 },
    lg:  { paddingVertical: 17, paddingHorizontal: 28 },
    xl:  { paddingVertical: 20, paddingHorizontal: 32 },
  }[size] || { paddingVertical: 14, paddingHorizontal: 24 };
  const fs = { sm: Typography.sm, md: Typography.base, lg: Typography.md, xl: Typography.md }[size] || Typography.base;

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
    <El
      onPress={onPress}
      activeOpacity={0.93}
      style={[styles.card, Shadows[shadow], style]}
    >
      {children}
    </El>
  );
}

// ── StatusPill ────────────────────────────────────────────────────
export function StatusPill({ status }) {
  const c = StatusColors[status] || { bg: Colors.bg, text: Colors.textSec, dot: Colors.textMuted };
  const label = ({
    pending:'Pending', processing:'Processing', preparing:'Preparing',
    ready_for_pickup:'Ready for Pickup', out_for_delivery:'Out for Delivery',
    delivered:'Delivered', cancelled:'Cancelled', assigned:'Assigned',
    picked_up:'Picked Up', on_the_way:'On the Way',
  })[status] || (status || '').replace(/_/g,' ');
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: c.dot }]} />
      <Text style={[styles.pillText, { color: c.text }]}>{label}</Text>
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
      {title    && <Text style={styles.emptyTitle}>{title}</Text>}
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

// ── SectionHeader ─────────────────────────────────────────────────
export function SectionHeader({ title, right }) {
  return (
    <View style={styles.secHeader}>
      <Text style={styles.secTitle}>{title}</Text>
      {right}
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────────────
export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

// ── ConnectionBanner ──────────────────────────────────────────────
export function ConnectionBanner({ connected, reconnecting }) {
  if (connected) return null;
  return (
    <View style={[styles.banner, { backgroundColor: reconnecting ? Colors.warning : Colors.danger }]}>
      <Text style={styles.bannerText}>
        {reconnecting ? '⏳  Reconnecting to server…' : '🔴  No connection — live updates paused'}
      </Text>
    </View>
  );
}

// ── Toast ─────────────────────────────────────────────────────────
export function Toast({ message, type = 'info', visible, onHide }) {
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
      const t = setTimeout(onHide, 3500);
      return () => clearTimeout(t);
    } else {
      Animated.timing(translateY, { toValue: -80, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  const bgMap = { success: Colors.success, error: Colors.danger, warning: Colors.warning, info: Colors.dark };
  return (
    <Animated.View style={[styles.toast, { backgroundColor: bgMap[type] || Colors.dark, transform: [{ translateY }] }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ── Step indicator (for delivery flow) ───────────────────────────
export function StepIndicator({ steps, currentStep }) {
  return (
    <View style={styles.stepRow}>
      {steps.map((s, i) => {
        const done    = i < currentStep;
        const current = i === currentStep;
        return (
          <React.Fragment key={i}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepDot,
                done    && { backgroundColor: Colors.success, borderColor: Colors.success },
                current && { backgroundColor: Colors.orange,  borderColor: Colors.orange  },
                !done && !current && { backgroundColor: '#fff', borderColor: Colors.border },
              ]}>
                {done
                  ? <Text style={styles.stepCheck}>✓</Text>
                  : <Text style={[styles.stepNum, { color: current ? '#fff' : Colors.textMuted }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[
                styles.stepLabel,
                current && { color: Colors.orange,  fontWeight: Typography.bold },
                done    && { color: Colors.success, fontWeight: Typography.semibold },
              ]}>{s}</Text>
            </View>
            {i < steps.length - 1 && (
              <View style={[styles.stepLine, (done) && { backgroundColor: Colors.success }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  riderChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,107,44,0.15)',
    borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,107,44,0.3)',
    paddingHorizontal: 10, paddingVertical: 3,
  },
  riderChipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.orange },
  riderChipText: { color: Colors.orange, fontSize: Typography.xs, fontWeight: Typography.extrabold, letterSpacing: 0.8 },

  btn: { borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontWeight: Typography.bold },

  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.base },

  pill: { flexDirection:'row', alignItems:'center', gap:5, alignSelf:'flex-start', borderRadius:Radius.full, paddingHorizontal:10, paddingVertical:4 },
  pillDot: { width:7, height:7, borderRadius:4 },
  pillText: { fontSize:Typography.xs, fontWeight:Typography.bold },

  center: { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:Colors.bg, gap:8 },
  loadingText: { color:Colors.textSec, fontSize:Typography.sm, marginTop:4 },

  empty: { alignItems:'center', justifyContent:'center', padding:Spacing.xxxl, gap:Spacing.sm },
  emptyIcon: { fontSize:52, marginBottom:4 },
  emptyTitle: { fontSize:Typography.md, fontWeight:Typography.extrabold, color:Colors.text, textAlign:'center' },
  emptySub: { fontSize:Typography.sm, color:Colors.textSec, textAlign:'center', lineHeight:21 },

  infoRow: { flexDirection:'row', alignItems:'flex-start', gap:Spacing.sm, paddingVertical:Spacing.sm },
  infoIcon: { fontSize:18, marginTop:2 },
  infoLabel: { fontSize:Typography.xs, color:Colors.textMuted, fontWeight:Typography.extrabold, textTransform:'uppercase', letterSpacing:0.6, marginBottom:2 },
  infoValue: { fontSize:Typography.base, color:Colors.text, fontWeight:Typography.medium, lineHeight:22 },

  secHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:Spacing.sm },
  secTitle: { fontSize:Typography.base, fontWeight:Typography.extrabold, color:Colors.text },

  divider: { height:1, backgroundColor:Colors.border, marginVertical:Spacing.sm },

  banner: { paddingHorizontal:Spacing.base, paddingVertical:10, alignItems:'center' },
  bannerText: { color:'#fff', fontSize:Typography.sm, fontWeight:Typography.semibold },

  toast: { position:'absolute', top:0, left:0, right:0, paddingHorizontal:Spacing.base, paddingVertical:14, zIndex:9999, alignItems:'center' },
  toastText: { color:'#fff', fontSize:Typography.sm, fontWeight:Typography.semibold, textAlign:'center' },

  stepRow: { flexDirection:'row', alignItems:'center', paddingHorizontal:Spacing.base, paddingVertical:Spacing.md },
  stepItem: { alignItems:'center', gap:4 },
  stepDot: { width:32, height:32, borderRadius:16, borderWidth:2, alignItems:'center', justifyContent:'center' },
  stepCheck: { color:'#fff', fontWeight:Typography.extrabold, fontSize:14 },
  stepNum: { fontSize:13, fontWeight:Typography.bold },
  stepLabel: { fontSize:10, color:Colors.textMuted, textAlign:'center', maxWidth:64 },
  stepLine: { flex:1, height:2, backgroundColor:Colors.border, marginBottom:14 },
});

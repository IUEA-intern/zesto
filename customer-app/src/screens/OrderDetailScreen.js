/**
 * screens/OrderDetailScreen.js — Zesto Customer
 * Live order tracking: joins the order's socket room and reacts to
 * order:update / notification:toast events in addition to polling.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { Card, StatusPill, LoadingScreen, InfoRow } from '../components';
import { OrderApi } from '../services/api';
import { on, trackOrder, untrackOrder } from '../services/socket';
import { formatCurrency, formatDateTime, ORDER_STATUS_STEPS, ORDER_STATUS_LABELS } from '../utils';

export default function OrderDetailScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await OrderApi.getById(orderId);
      if (res?.success) setOrder(res.data);
    } catch {
      // Leave existing state — user can pull to refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    trackOrder(orderId);
    return () => untrackOrder(orderId);
  }, [orderId]);

  useEffect(() => on('order:update', (data) => {
    if (String(data?.orderId) === String(orderId) || String(data?.order_id) === String(orderId)) load();
  }), [orderId, load]);

  useEffect(() => on('order:status', (data) => {
    if (String(data?.order_id) === String(orderId)) load();
  }), [orderId, load]);

  useEffect(() => on('notification:toast', () => load()), [load]);

  if (loading) return <LoadingScreen message="Loading order details…" />;
  if (!order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>😕</Text>
          <Text style={styles.errorText}>Order not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cancelled = order.status === 'cancelled';
  const currentStepIndex = ORDER_STATUS_STEPS.indexOf(order.status);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order #{order.order_id}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.orange} />}
      >
        <Card style={{ marginBottom: Spacing.lg, alignItems: 'center' }} shadow="sm">
          <StatusPill status={order.status} />
          <Text style={styles.bigStatusIcon}>{cancelled ? '❌' : STATUS_EMOJI[order.status] || '📦'}</Text>
          <Text style={styles.statusHeadline}>
            {cancelled ? 'This order was cancelled' : (ORDER_STATUS_LABELS[order.status] || order.status)}
          </Text>
          <Text style={styles.statusSub}>Placed {formatDateTime(order.created_at)}</Text>
        </Card>

        {!!order.delivery_confirmation_code && (
          <Card style={styles.codeCard} shadow="sm">
            <Text style={styles.codeLabel}>🔑 DELIVERY CODE</Text>
            <Text style={styles.codeValue}>{order.delivery_confirmation_code}</Text>
            <Text style={styles.codeHint}>Give this code to the rider when your order arrives</Text>
          </Card>
        )}

        {!cancelled && (
          <Card style={{ marginBottom: Spacing.lg }} shadow="xs">
            <Text style={styles.sectionTitle}>Order Progress</Text>
            <View style={styles.timeline}>
              {ORDER_STATUS_STEPS.map((step, idx) => {
                const done = idx <= currentStepIndex;
                return (
                  <View key={step} style={styles.timelineRow}>
                    <View style={styles.timelineDotCol}>
                      <View style={[styles.timelineDot, done && styles.timelineDotDone]} />
                      {idx < ORDER_STATUS_STEPS.length - 1 && (
                        <View style={[styles.timelineLine, done && idx < currentStepIndex && styles.timelineLineDone]} />
                      )}
                    </View>
                    <Text style={[styles.timelineLabel, done && styles.timelineLabelDone]}>
                      {ORDER_STATUS_LABELS[step]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        <Card style={{ marginBottom: Spacing.lg }} shadow="xs">
          <Text style={styles.sectionTitle}>Items</Text>
          {(order.items || []).map(item => (
            <View key={item.item_id} style={styles.itemRow}>
              <Text style={styles.itemQty}>{item.qty}×</Text>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemPrice}>{formatCurrency(item.subtotal)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.itemRow}>
            <Text style={styles.itemName}>Subtotal</Text>
            <Text style={styles.itemPrice}>{formatCurrency(order.subtotal)}</Text>
          </View>
          <View style={styles.itemRow}>
            <Text style={styles.itemName}>Delivery Fee</Text>
            <Text style={styles.itemPrice}>{formatCurrency(order.delivery_fee)}</Text>
          </View>
          <View style={styles.itemRow}>
            <Text style={[styles.itemName, { fontWeight: Typography.extrabold, color: Colors.text }]}>Total</Text>
            <Text style={[styles.itemPrice, { fontWeight: Typography.extrabold, fontSize: Typography.base }]}>{formatCurrency(order.total)}</Text>
          </View>
        </Card>

        <Card shadow="xs">
          <Text style={styles.sectionTitle}>Delivery Details</Text>
          <InfoRow icon="📍" label="Delivery Address" value={order.delivery_address} />
          {!!order.notes && <InfoRow icon="📝" label="Notes" value={order.notes} />}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const STATUS_EMOJI = {
  pending: '🧾', processing: '✅', preparing: '👨‍🍳',
  ready_for_pickup: '📦', out_for_delivery: '🛵', delivered: '🎉',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: Colors.textSec, fontSize: Typography.base },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.text },
  bigStatusIcon: { fontSize: 44, marginTop: Spacing.md, marginBottom: 4 },
  codeCard: {
    marginBottom: Spacing.lg, alignItems: 'center', backgroundColor: Colors.dark,
    paddingVertical: Spacing.lg,
  },
  codeLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.orange, letterSpacing: 1, marginBottom: 6 },
  codeValue: { fontSize: 34, fontWeight: Typography.extrabold, color: '#fff', letterSpacing: 6, marginBottom: 8 },
  codeHint: { fontSize: Typography.xs, color: Colors.textOnDarkSec, textAlign: 'center', paddingHorizontal: Spacing.lg },
  statusHeadline: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.text, marginBottom: 2 },
  statusSub: { fontSize: Typography.xs, color: Colors.textMuted },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.text, marginBottom: Spacing.md, textTransform: 'uppercase', letterSpacing: 0.4 },
  timeline: { paddingLeft: Spacing.xs },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineDotCol: { alignItems: 'center', width: 24 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.border, marginTop: 3 },
  timelineDotDone: { backgroundColor: Colors.success },
  timelineLine: { width: 2, flex: 1, minHeight: 22, backgroundColor: Colors.border },
  timelineLineDone: { backgroundColor: Colors.success },
  timelineLabel: { fontSize: Typography.sm, color: Colors.textMuted, marginLeft: Spacing.sm, marginBottom: 18, fontWeight: Typography.medium },
  timelineLabelDone: { color: Colors.text, fontWeight: Typography.bold },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  itemQty: { width: 32, fontSize: Typography.sm, color: Colors.textSec, fontWeight: Typography.bold },
  itemName: { flex: 1, fontSize: Typography.sm, color: Colors.textSec },
  itemPrice: { fontSize: Typography.sm, color: Colors.text, fontWeight: Typography.semibold },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
});

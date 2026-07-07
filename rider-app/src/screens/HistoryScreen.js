/**
 * screens/HistoryScreen.js — Zesto Rider
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { Card, EmptyState, StatusPill, Divider } from '../components';
import { RiderApi } from '../services/api';
import { formatCurrency, formatDateTime } from '../utils';

export default function HistoryScreen() {
  const [deliveries,  setDeliveries]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total,       setTotal]       = useState(0);

  const load = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (!append) setLoading(true); else setLoadingMore(true);
      const res = await RiderApi.getHistory(pageNum);
      if (res?.success) {
        const items = res.data || [];
        setTotal(res.meta?.total || 0);
        setDeliveries(prev => append ? [...prev, ...items] : items);
        setHasMore(items.length === (res.meta?.limit || 20));
        setPage(pageNum);
      }
    } catch {}
    finally { setLoading(false); setLoadingMore(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(1); }, []);

  const onRefresh = () => { setRefreshing(true); load(1); };
  const onMore    = () => { if (!loadingMore && hasMore) load(page + 1, true); };

  const delivered = deliveries.filter(d => d.delivery_status === 'delivered');
  const earnings  = delivered.reduce((s, d) => s + Number(d.delivery_fee || 0), 0);

  const renderItem = ({ item }) => (
    <Card style={styles.card} shadow="sm">
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.orderNum}>{item.order_number}</Text>
          <Text style={styles.restaurant}>🏪  {item.restaurant_name}</Text>
        </View>
        <StatusPill status={item.delivery_status} />
      </View>
      <Text style={styles.address} numberOfLines={1}>📍  {item.delivery_address}</Text>
      <Divider />
      <View style={styles.metaRow}>
        <MetaItem label="EARNED" value={formatCurrency(item.delivery_fee)} highlight />
        <MetaItem label="ORDER" value={formatCurrency(item.total)} />
        <MetaItem label="DATE" value={
          item.delivered_at ? formatDateTime(item.delivered_at) : formatDateTime(item.assigned_at)
        } />
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top','left','right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Delivery History</Text>
        <Text style={styles.headerSub}>{total} total deliveries</Text>
      </View>

      {!loading && deliveries.length > 0 && (
        <View style={styles.summaryRow}>
          <SummaryCard label="Completed" value={String(delivered.length)} color={Colors.success} bg={Colors.successBg} />
          <SummaryCard label="Total Earned" value={formatCurrency(earnings)} color={Colors.orange} bg={Colors.orangePale} />
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.orange} />
        </View>
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={item => String(item.delivery_id)}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, deliveries.length === 0 && { flex: 1 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.orange} />}
          onEndReached={onMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.orange} style={{ padding: Spacing.base }} /> : null}
          ListEmptyComponent={
            <EmptyState icon="📋" title="No Deliveries Yet" subtitle="Completed deliveries will appear here." />
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

function MetaItem({ label, value, highlight }) {
  return (
    <View>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, highlight && { color: Colors.orange, fontWeight: Typography.extrabold }]}>{value}</Text>
    </View>
  );
}

function SummaryCard({ label, value, color, bg }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: bg }]}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.surface, paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.text },
  headerSub:   { fontSize: Typography.sm, color: Colors.textSec, marginTop: 2 },
  summaryRow:  { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.base },
  summaryCard: { flex: 1, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: Typography.xl, fontWeight: Typography.extrabold },
  summaryLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  list:   { padding: Spacing.base, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card:   { gap: Spacing.xs },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs },
  orderNum:   { fontSize: Typography.md, fontWeight: Typography.extrabold, color: Colors.text },
  restaurant: { fontSize: Typography.sm, color: Colors.textSec, marginTop: 2 },
  address:    { fontSize: Typography.sm, color: Colors.textSec },
  metaRow:    { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.sm },
  metaLabel:  { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.extrabold, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  metaValue:  { fontSize: Typography.sm, color: Colors.text, fontWeight: Typography.semibold },
});

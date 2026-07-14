/**
 * screens/OrdersScreen.js — Zesto Customer
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Card, StatusPill, EmptyState, LoadingScreen, Button } from '../components';
import { OrderApi } from '../services/api';
import { formatCurrency, formatDateTime } from '../utils';

export default function OrdersScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('inProgress');

  const load = useCallback(async () => {
    try {
      const res = await OrderApi.list();
      if (res?.success) setOrders(res.data || []);
    } catch {
      // Empty state covers the failure case
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <LoadingScreen message="Loading your orders…" />;

  const inProgressOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const historyOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));
  const currentOrders = tab === 'history' ? historyOrders : inProgressOrders;
  const emptyState = tab === 'history'
    ? {
      icon: '🕰️',
      title: 'No past orders yet',
      subtitle: 'Your completed and cancelled orders will appear here once you have an order history.',
    }
    : {
      icon: '🚚',
      title: 'No active orders',
      subtitle: 'Orders that are being prepared or delivered appear here.',
    };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
      </View>
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setTab('inProgress')}
          style={({ pressed }) => [styles.tabButton, tab === 'inProgress' && styles.tabButtonActive, pressed && styles.tabButtonPressed]}
        >
          <Text style={[styles.tabText, tab === 'inProgress' && styles.tabTextActive]}>In Progress</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('history')}
          style={({ pressed }) => [styles.tabButton, tab === 'history' && styles.tabButtonActive, pressed && styles.tabButtonPressed]}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>Order History</Text>
        </Pressable>
      </View>
      <FlatList
        data={currentOrders}
        keyExtractor={item => String(item.order_id)}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.orange} />}
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('OrderDetail', { orderId: item.order_id })} style={styles.card} shadow="xs">
            <View style={styles.cardTop}>
              <Text style={styles.orderNum}>Order #{item.order_id}</Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={styles.orderDate}>{formatDateTime(item.created_at)}</Text>
            {!!item.delivery_confirmation_code && (
              <View style={styles.codeChip}>
                <Text style={styles.codeChipText}>🔑 Delivery Code: {item.delivery_confirmation_code}</Text>
              </View>
            )}
            <View style={styles.cardBottom}>
              <Text style={styles.orderTotal}>{formatCurrency(item.total)}</Text>
              <Text style={styles.paymentLabel}>
                {item.payment_status === 'verified' ? '✅ Paid' : item.payment_status === 'pending' ? '⏳ Payment pending' : (item.payment_status || '—')}
              </Text>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState icon={emptyState.icon} title={emptyState.title}
            subtitle={emptyState.subtitle}
            action={tab === 'history' ? <Button title="Browse Restaurants" onPress={() => navigation.navigate('HomeTab')} icon="🍽️" /> : null}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.text },
  tabRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.md },
  tabButtonActive: { backgroundColor: Colors.orangePale },
  tabButtonPressed: { opacity: 0.7 },
  tabText: { fontSize: Typography.sm, color: Colors.textSec, fontWeight: Typography.semibold },
  tabTextActive: { color: Colors.orange },
  card: { marginBottom: Spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNum: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.text },
  orderDate: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: 10 },
  codeChip: {
    backgroundColor: Colors.orangePale, borderRadius: Radius.sm, paddingVertical: 6,
    paddingHorizontal: 10, marginBottom: 10, alignSelf: 'flex-start',
  },
  codeChipText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.orangeDark, letterSpacing: 0.5 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderTotal: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.orangeDark },
  paymentLabel: { fontSize: Typography.xs, color: Colors.textSec, fontWeight: Typography.medium },
});

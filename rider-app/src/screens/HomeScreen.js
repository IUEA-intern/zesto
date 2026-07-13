/**
 * screens/HomeScreen.js — Zesto Rider
 * Open delivery pool with live real-time updates.
 * Professional Uber/Glovo-style order cards.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  Switch, TouchableOpacity, Animated, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import {
  ZestoBrand, RiderChip, Card, Button, EmptyState,
  ConnectionBanner, Toast, StatusPill,
} from '../components';
import { useAuth } from '../services/AuthContext';
import { RiderApi } from '../services/api';
import { joinRiderPool, leaveRiderPool, on } from '../services/socket';
import { useConnectionStatus, useOrderPool } from '../hooks/useSocket';
import { formatCurrency, timeAgo, truncate } from '../utils';

export default function HomeScreen({ navigation }) {
  const { riderProfile, isApproved, isAvailable, setRiderProfile, refreshProfile } = useAuth();
  const { connected, reconnecting } = useConnectionStatus();
  const { orders, setOrders } = useOrderPool(isAvailable);
  const [toggling,   setToggling]   = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const showToast = (message, type = 'info') => {
    setToast({ visible: true, message, type });
  };

  // Pulse animation for online indicator
  useEffect(() => {
    if (!isAvailable) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isAvailable]);

  // Load order pool
  const loadPool = useCallback(async () => {
    if (!isApproved || !isAvailable) { setOrders([]); return; }
    try {
      const res = await RiderApi.getAvailableOrders();
      if (res?.success) setOrders(res.data || []);
    } catch (err) {
      showToast(err.message || 'Failed to load orders', 'error');
    }
  }, [isApproved, isAvailable]);

  useEffect(() => { loadPool(); }, [loadPool]);

  // Check for active delivery on mount
  useEffect(() => {
    if (!isApproved) return;
    RiderApi.getActiveDelivery()
      .then(res => { if (res?.success && res.data) navigation.navigate('ActiveDelivery', { delivery: res.data }); })
      .catch(() => {});
  }, [isApproved]);

  // Socket reconnect → reload
  useEffect(() => {
    const unsub = on('reconnect', () => loadPool());
    return unsub;
  }, [loadPool]);

  // Toggle online/offline
  async function handleToggle(value) {
    setToggling(true);
    try {
      await RiderApi.setAvailability(value);
      setRiderProfile(prev => ({ ...prev, is_available: value ? 1 : 0 }));
      if (value) {
        joinRiderPool(riderProfile?.rider_id, riderProfile?.user_id);
        await loadPool();
        showToast('🟢  You are now online and visible to orders!', 'success');
      } else {
        leaveRiderPool();
        setOrders([]);
        showToast('You are now offline.', 'info');
      }
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setToggling(false);
    }
  }

  // Accept delivery
  async function handleAccept(order) {
    setAcceptingId(order.order_id);
    try {
      await RiderApi.acceptOrder(order.order_id);
      showToast('✅  Order accepted! Navigate to the restaurant.', 'success');
      setTimeout(async () => {
        const res = await RiderApi.getActiveDelivery();
        if (res?.success && res.data) navigation.navigate('ActiveDelivery', { delivery: res.data });
      }, 600);
    } catch (err) {
      showToast(err.message || 'Could not accept — it may have been taken.', 'error');
      loadPool();
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadPool();
    setRefreshing(false);
  }

  // ── Order card ───────────────────────────────────────────────
  const renderOrder = ({ item, index }) => {
    const isAccepting = acceptingId === item.order_id;
    const fadeAnim = new Animated.Value(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true }).start();

    return (
      <Animated.View style={{ opacity: fadeAnim }}>
        <Card style={styles.orderCard} shadow="md">
          {/* Top row */}
          <View style={styles.orderTop}>
            <View style={styles.orderTopLeft}>
              <Text style={styles.orderNum}>{item.order_number}</Text>
              <StatusPill status="ready_for_pickup" />
            </View>
            <View style={styles.earningsBadge}>
              <Text style={styles.earningsLabel}>EARN</Text>
              <Text style={styles.earningsValue}>{formatCurrency(item.delivery_fee)}</Text>
            </View>
          </View>

          {/* Route visual */}
          <View style={styles.routeBox}>
            {/* Pickup */}
            <View style={styles.routeRow}>
              <View style={styles.routeIconWrap}>
                <View style={[styles.routeIcon, { backgroundColor: Colors.orange }]}>
                  <Text style={styles.routeIconText}>P</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeTypeLabel}>PICKUP</Text>
                <Text style={styles.routeMainText} numberOfLines={1}>{item.restaurant_name}</Text>
                <Text style={styles.routeSubText} numberOfLines={1}>
                  {truncate(item.restaurant_address || '', 55)}
                </Text>
              </View>
            </View>

            {/* Connector line */}
            <View style={styles.routeConnector}>
              <View style={styles.routeConnectorLine} />
            </View>

            {/* Dropoff */}
            <View style={styles.routeRow}>
              <View style={styles.routeIconWrap}>
                <View style={[styles.routeIcon, { backgroundColor: Colors.success }]}>
                  <Text style={styles.routeIconText}>D</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeTypeLabel}>DELIVER TO</Text>
                <Text style={styles.routeMainText} numberOfLines={1}>{item.customer_name || 'Customer'}</Text>
                <Text style={styles.routeSubText} numberOfLines={2}>
                  {truncate(item.delivery_address || '', 65)}
                </Text>
              </View>
            </View>
          </View>

          {/* Order meta */}
          <View style={styles.orderMeta}>
            <MetaChip icon="🛍️" label={`${item.item_count || '?'} item${item.item_count !== 1 ? 's' : ''}`} />
            <MetaChip icon="💰" label={formatCurrency(item.total)} />
            <MetaChip icon="🕐" label={timeAgo(item.created_at)} />
          </View>

          {/* Accept button */}
          <Button
            title={isAccepting ? 'Accepting…' : 'Accept Delivery'}
            onPress={() => handleAccept(item)}
            loading={isAccepting}
            disabled={!!acceptingId}
            size="md"
            style={{ marginTop: Spacing.md }}
          />
        </Card>
      </Animated.View>
    );
  };

  // ── Pending approval ──────────────────────────────────────────
  if (!isApproved) {
    return (
      <SafeAreaView style={styles.safe} edges={['top','left','right']}>
        <Header riderProfile={riderProfile} />
        <EmptyState
          icon="⏳"
          title="Account Pending Approval"
          subtitle="Your rider account is being reviewed by the Zesto team. You'll be notified once approved.\n\nContact riders@zesto.ug or call +256 700 000 000 to speed up approval."
        />
      </SafeAreaView>
    );
  }

  const onlineCount = orders.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top','left','right']}>
      <ConnectionBanner connected={connected} reconnecting={reconnecting} />
      <Toast {...toast} onHide={() => setToast(p=>({...p,visible:false}))} />

      <Header riderProfile={riderProfile} />

      {/* Availability toggle bar */}
      <View style={[styles.availBar, { backgroundColor: isAvailable ? Colors.dark : Colors.surface }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            {isAvailable && (
              <Animated.View style={[styles.onlineDot, { transform: [{ scale: pulseAnim }] }]} />
            )}
            <Text style={[styles.availStatus, { color: isAvailable ? '#fff' : Colors.textSec }]}>
              {isAvailable ? 'Online — Receiving Orders' : 'Offline'}
            </Text>
          </View>
          {isAvailable && (
            <Text style={styles.availSub}>
              {onlineCount} order{onlineCount !== 1 ? 's' : ''} available · {connected ? 'Live 🟢' : 'Reconnecting…'}
            </Text>
          )}
        </View>
        <Switch
          value={!!isAvailable}
          onValueChange={handleToggle}
          disabled={toggling}
          thumbColor="#fff"
          trackColor={{ false: Colors.border, true: Colors.orange }}
          ios_backgroundColor={Colors.border}
        />
      </View>

      {/* Order list */}
      {!isAvailable ? (
        <EmptyState
          icon="💤"
          title="You're Offline"
          subtitle="Toggle the switch above to go online and start seeing available deliveries in real-time."
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => String(item.order_id)}
          renderItem={renderOrder}
          contentContainerStyle={[styles.list, orders.length === 0 && { flex: 1 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.orange} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="📭"
              title="No Orders Yet"
              subtitle="New delivery requests will appear here instantly as restaurants mark orders ready for pickup.\n\nStay online!"
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        />
      )}
    </SafeAreaView>
  );
}

function Header({ riderProfile }) {
  const firstName = (riderProfile?.name || 'Rider').split(' ')[0];
  return (
    <View style={styles.header}>
      <ZestoBrand size="md" />
      <Text style={styles.greeting}>Hi, {firstName} 👋</Text>
    </View>
  );
}

function MetaChip({ icon, label }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipText}>{icon}  {label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  greeting: { fontSize: Typography.sm, color: Colors.textSec },
  availBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.success },
  availStatus: { fontSize: Typography.base, fontWeight: Typography.extrabold },
  availSub: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  list: { padding: Spacing.base, paddingBottom: Spacing.xxxl },
  orderCard: { borderRadius: Radius.md, padding: 0, overflow: 'hidden' },
  orderTop: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  orderTopLeft: { gap: Spacing.xs },
  orderNum: { fontSize: Typography.md, fontWeight: Typography.extrabold, color: Colors.text },
  earningsBadge: {
    backgroundColor: Colors.orangePale, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,107,44,0.2)',
  },
  earningsLabel: { fontSize: 9, fontWeight: Typography.extrabold, color: Colors.orange, letterSpacing: 0.8 },
  earningsValue: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.orange },
  routeBox: { padding: Spacing.base, gap: 0 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  routeIconWrap: { alignItems: 'center' },
  routeIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  routeIconText: { color: '#fff', fontSize: 11, fontWeight: Typography.extrabold },
  routeConnector: { paddingLeft: 13, paddingVertical: 3 },
  routeConnectorLine: { width: 2, height: 18, backgroundColor: Colors.border },
  routeTypeLabel: {
    fontSize: 10, color: Colors.textMuted, fontWeight: Typography.extrabold,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 1,
  },
  routeMainText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.text },
  routeSubText: { fontSize: Typography.xs, color: Colors.textSec, marginTop: 1, lineHeight: 17 },
  orderMeta: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: 0, paddingBottom: Spacing.base,
    borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing.sm,
  },
  metaChip: {
    backgroundColor: Colors.bg, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 5,
  },
  metaChipText: { fontSize: Typography.xs, color: Colors.textSec, fontWeight: Typography.semibold },
});

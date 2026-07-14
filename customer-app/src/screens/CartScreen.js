/**
 * screens/CartScreen.js — Zesto Customer
 */
import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { Card, Button, EmptyState, QuantityStepper } from '../components';
import { resolveImage } from '../services/api';
import { formatCurrency } from '../utils';
import { useCart } from '../services/CartContext';

export default function CartScreen({ navigation }) {
  const { items, subtotal, loading, updateQty, removeItem, refresh } = useCart();

  function confirmRemove(item) {
    // Direct removal avoids platform alert issues and makes the action reliable.
    removeItem(item.cart_id);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Cart</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => String(item.cart_id)}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 160 }}
        onRefresh={refresh}
        refreshing={loading}
        renderItem={({ item }) => (
          <CartRow
            item={item}
            onIncrease={() => updateQty(item.cart_id, item.qty + 1)}
            onDecrease={() => (item.qty <= 1 ? confirmRemove(item) : updateQty(item.cart_id, item.qty - 1))}
            onRemove={() => confirmRemove(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState icon="🛒" title="Your cart is empty"
            subtitle="Browse restaurants and add some delicious food to get started."
            action={<Button title="Browse Restaurants" onPress={() => navigation.navigate('HomeTab')} icon="🍽️" />}
          />
        }
      />

      {items.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <Text style={styles.footerNote}>Delivery fee calculated at checkout</Text>
          <Button
            title="Proceed to Checkout"
            onPress={() => navigation.navigate('Checkout')}
            size="lg"
            icon="→"
            style={{ marginTop: Spacing.sm }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function CartRow({ item, onIncrease, onDecrease, onRemove }) {
  const img = resolveImage(item.image_url);
  return (
    <Card style={styles.row} shadow="xs">
      {img ? (
        <Image source={{ uri: img }} style={styles.rowImg} />
      ) : (
        <View style={[styles.rowImg, styles.rowImgFallback]}><Text style={{ fontSize: 22 }}>🍽️</Text></View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowPrice}>{formatCurrency(item.price)}</Text>
        <View style={styles.rowBottom}>
          <QuantityStepper qty={item.qty} size="sm" onIncrease={onIncrease} onDecrease={onDecrease} />
          <Pressable onPress={onRemove} hitSlop={12} style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnActive]}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.text },
  row: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm, padding: Spacing.sm },
  rowImg: { width: 64, height: 64, borderRadius: Radius.sm, backgroundColor: Colors.bg },
  rowImgFallback: { alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.text, marginBottom: 2 },
  rowPrice: { fontSize: Typography.sm, color: Colors.orangeDark, fontWeight: Typography.bold, marginBottom: 8 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  removeBtn: { borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 6 },
  removeBtnActive: { backgroundColor: Colors.bgMuted },
  removeText: { color: Colors.danger, fontSize: Typography.sm, fontWeight: Typography.semibold },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.surface,
    padding: Spacing.base, borderTopWidth: 1, borderTopColor: Colors.border, ...Shadows.lg,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  totalLabel: { fontSize: Typography.base, color: Colors.textSec, fontWeight: Typography.medium },
  totalValue: { fontSize: Typography.lg, color: Colors.text, fontWeight: Typography.extrabold },
  footerNote: { fontSize: Typography.xs, color: Colors.textMuted },
});

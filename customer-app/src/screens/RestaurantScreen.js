/**
 * screens/RestaurantScreen.js — Zesto Customer
 * Shows a single restaurant's menu, grouped/filterable by category.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows, CategoryIcons } from '../theme';
import { Card, EmptyState, LoadingScreen, QuantityStepper, Badge } from '../components';
import { ProductApi, resolveImage } from '../services/api';
import { formatCurrency } from '../utils';
import { useCart } from '../services/CartContext';

export default function RestaurantScreen({ route, navigation }) {
  const { restaurant } = route.params;
  const { items, itemCount, addItem, updateQty, removeItem } = useCart();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await ProductApi.list({ restaurant_id: restaurant.restaurant_id });
        if (!cancelled && res?.success) setProducts(res.data || []);
      } catch {
        // Empty-state renders on its own
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [restaurant.restaurant_id]);

  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.category || 'other'));
    return ['all', ...Array.from(set)];
  }, [products]);

  const filtered = category === 'all' ? products : products.filter(p => (p.category || 'other') === category);

  function cartItemFor(productId) {
    return items.find(i => i.product_id === productId);
  }

  if (loading) return <LoadingScreen message={`Loading ${restaurant.name}'s menu…`} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{restaurant.name}</Text>
          <Text style={styles.headerSub}>⭐ {restaurant.rating || '4.5'} · {restaurant.deliveryTime || '20-30 min'}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'CartTab' })} style={styles.cartBtn}>
          <Text style={{ fontSize: 20 }}>🛒</Text>
          <Badge count={itemCount} />
        </TouchableOpacity>
      </View>

      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catBar}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}>
          {categories.map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.catChip, category === c && styles.catChipActive]}
              activeOpacity={0.8}
            >
              <Text numberOfLines={1} style={[styles.catChipText, category === c && styles.catChipTextActive]}>
                {c === 'all' ? 'All' : `${CategoryIcons[c] || '🍔'} ${c[0].toUpperCase()}${c.slice(1)}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={filtered}
        keyExtractor={item => String(item.product_id)}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            cartItem={cartItemFor(item.product_id)}
            onAdd={() => addItem(item, 1)}
            onIncrease={(cartItem) => updateQty(cartItem.cart_id, cartItem.qty + 1)}
            onDecrease={(cartItem) => cartItem.qty - 1 < 1 ? removeItem(cartItem.cart_id) : updateQty(cartItem.cart_id, cartItem.qty - 1)}
          />
        )}
        ListEmptyComponent={
          <EmptyState icon="🍽️" title="No items yet" subtitle="This restaurant hasn't added any menu items in this category." />
        }
      />
    </SafeAreaView>
  );
}

function ProductRow({ product, cartItem, onAdd, onIncrease, onDecrease }) {
  const img = resolveImage(product.image_url);
  const outOfStock = Number(product.stock) <= 0;
  return (
    <Card style={styles.prodCard} shadow="xs">
      <View style={styles.prodRow}>
        {img ? (
          <Image source={{ uri: img }} style={styles.prodImg} />
        ) : (
          <View style={[styles.prodImg, styles.prodImgFallback]}>
            <Text style={{ fontSize: 24 }}>{CategoryIcons[product.category] || '🍽️'}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.prodName} numberOfLines={1}>{product.name}</Text>
          {!!product.description && (
            <Text style={styles.prodDesc} numberOfLines={2}>{product.description}</Text>
          )}
          <View style={styles.prodBottomRow}>
            <Text style={styles.prodPrice}>{formatCurrency(product.price)}</Text>
            {outOfStock ? (
              <Text style={styles.outOfStock}>Out of stock</Text>
            ) : cartItem ? (
              <QuantityStepper
                qty={cartItem.qty}
                size="sm"
                onIncrease={() => onIncrease(cartItem)}
                onDecrease={() => onDecrease(cartItem)}
              />
            ) : (
              <TouchableOpacity onPress={onAdd} style={styles.addBtn} activeOpacity={0.85}>
                <Text style={styles.addBtnText}>Add +</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.text },
  headerSub: { fontSize: Typography.xs, color: Colors.textSec, marginTop: 2 },
  cartBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  catBar: { backgroundColor: Colors.surface, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  catChip: {
    height: 36, paddingHorizontal: 14, borderRadius: Radius.full,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  catChipActive: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  catChipText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSec, lineHeight: 18 },
  catChipTextActive: { color: '#fff' },
  prodCard: { marginBottom: Spacing.sm, padding: Spacing.sm },
  prodRow: { flexDirection: 'row', gap: Spacing.md },
  prodImg: { width: 80, height: 80, borderRadius: Radius.sm, backgroundColor: Colors.bg },
  prodImgFallback: { alignItems: 'center', justifyContent: 'center' },
  prodName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.text, marginBottom: 2 },
  prodDesc: { fontSize: Typography.xs, color: Colors.textSec, lineHeight: 16, marginBottom: 6 },
  prodBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  prodPrice: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.orangeDark },
  addBtn: { backgroundColor: Colors.orangePale, paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.full },
  addBtnText: { color: Colors.orangeDark, fontWeight: Typography.bold, fontSize: Typography.sm },
  outOfStock: { color: Colors.danger, fontSize: Typography.xs, fontWeight: Typography.semibold },
});
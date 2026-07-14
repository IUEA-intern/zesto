/**
 * screens/HomeScreen.js — Zesto Customer
 * Browse restaurants + featured products.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { Card, EmptyState, LoadingScreen, Badge } from '../components';
import { RestaurantApi, ProductApi, resolveImage } from '../services/api';
import { formatCurrency } from '../utils';
import { useAuth } from '../services/AuthContext';
import { useCart } from '../services/CartContext';

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const { itemCount, addItem } = useCart();
  const [restaurants, setRestaurants] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const [rRes, pRes] = await Promise.all([
        RestaurantApi.list(),
        ProductApi.list(),
      ]);
      if (rRes?.success) setRestaurants(rRes.data || []);
      if (pRes?.success) setFeatured((pRes.data || []).filter(p => p.is_featured).slice(0, 10));
    } catch {
      // Keep whatever we already have; the list renders an empty state.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  const filteredRestaurants = query.trim()
    ? restaurants.filter(r => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    : restaurants;

  if (loading) return <LoadingScreen message="Finding great food near you…" />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={filteredRestaurants}
        keyExtractor={item => String(item.restaurant_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.orange} />}
        contentContainerStyle={{ paddingBottom: Spacing.xxxl }}
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <View>
                <Text style={styles.greeting}>Hi {user?.name?.split(' ')[0] || 'there'} 👋</Text>
                <Text style={styles.subGreeting}>What are you craving today?</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('CartTab')} style={styles.cartBtn}>
                <Text style={{ fontSize: 22 }}>🛒</Text>
                <Badge count={itemCount} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search restaurants…"
                placeholderTextColor={Colors.textMuted}
                style={styles.searchInput}
              />
            </View>

            {featured.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Featured Picks</Text>
                <FlatList
                  data={featured}
                  keyExtractor={item => `feat-${item.product_id}`}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.md }}
                  renderItem={({ item }) => (
                    <FeaturedProductCard product={item} onAdd={() => addItem(item, 1)} />
                  )}
                />
              </View>
            )}

            <View style={[styles.section, { paddingBottom: 0 }]}>
              <Text style={styles.sectionTitle}>Restaurants</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <RestaurantCard restaurant={item} onPress={() => navigation.navigate('Restaurant', { restaurant: item })} />
        )}
        ListEmptyComponent={
          <EmptyState icon="🍽️" title="No restaurants found"
            subtitle={query ? 'Try a different search term.' : 'Check back soon — new restaurants are joining Zesto.'} />
        }
      />
    </SafeAreaView>
  );
}

function RestaurantCard({ restaurant, onPress }) {
  const img = resolveImage(restaurant.logo_url);
  return (
    <Card onPress={onPress} style={styles.restCard} shadow="sm">
      <View style={styles.restRow}>
        <View style={styles.restLogoWrap}>
          {img ? (
            <Image source={{ uri: img }} style={styles.restLogo} />
          ) : (
            <View style={[styles.restLogo, styles.restLogoFallback]}>
              <Text style={{ fontSize: 26 }}>🍴</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.restName} numberOfLines={1}>{restaurant.name}</Text>
          <Text style={styles.restDesc} numberOfLines={2}>{restaurant.description || 'Delicious food, delivered fast.'}</Text>
          <View style={styles.restMetaRow}>
            <Text style={styles.restMeta}>⭐ {restaurant.rating || '4.5'}</Text>
            <Text style={styles.restMetaDot}>•</Text>
            <Text style={styles.restMeta}>{restaurant.deliveryTime || '20-30 min'}</Text>
            <Text style={styles.restMetaDot}>•</Text>
            <Text style={styles.restMeta}>{restaurant.deliveryFee || 'Delivery fee applies'}</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

function FeaturedProductCard({ product, onAdd }) {
  const img = resolveImage(product.image_url);
  return (
    <Card style={styles.featCard} shadow="sm">
      {img ? (
        <Image source={{ uri: img }} style={styles.featImg} />
      ) : (
        <View style={[styles.featImg, styles.featImgFallback]}><Text style={{ fontSize: 30 }}>🍔</Text></View>
      )}
      <Text style={styles.featName} numberOfLines={1}>{product.name}</Text>
      <View style={styles.featBottomRow}>
        <Text style={styles.featPrice}>{formatCurrency(product.price)}</Text>
        <TouchableOpacity onPress={onAdd} style={styles.featAddBtn} activeOpacity={0.8}>
          <Text style={styles.featAddBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  greeting: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.text },
  subGreeting: { fontSize: Typography.sm, color: Colors.textSec, marginTop: 2 },
  cartBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', ...Shadows.sm,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    marginHorizontal: Spacing.base, borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    height: 46, ...Shadows.xs, marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.text },
  section: { paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  sectionTitle: {
    fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.text,
    paddingHorizontal: Spacing.base, marginBottom: Spacing.sm,
  },
  restCard: { marginHorizontal: Spacing.base, marginBottom: Spacing.md, padding: Spacing.md },
  restRow: { flexDirection: 'row', gap: Spacing.md },
  restLogoWrap: { borderRadius: Radius.sm, overflow: 'hidden' },
  restLogo: { width: 64, height: 64, borderRadius: Radius.sm, backgroundColor: Colors.bg },
  restLogoFallback: { alignItems: 'center', justifyContent: 'center' },
  restName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.text, marginBottom: 2 },
  restDesc: { fontSize: Typography.xs, color: Colors.textSec, lineHeight: 16, marginBottom: 6 },
  restMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  restMeta: { fontSize: Typography.xs, color: Colors.textSec, fontWeight: Typography.medium },
  restMetaDot: { fontSize: Typography.xs, color: Colors.textMuted },
  featCard: { width: 140, padding: Spacing.sm },
  featImg: { width: '100%', height: 90, borderRadius: Radius.sm, backgroundColor: Colors.bg, marginBottom: 8 },
  featImgFallback: { alignItems: 'center', justifyContent: 'center' },
  featName: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.text, marginBottom: 4 },
  featBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  featPrice: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.orangeDark },
  featAddBtn: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center',
  },
  featAddBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: -1 },
});

/**
 * screens/ActiveDeliveryScreen.js — Zesto Rider
 * Map-first delivery screen with full navigation flow.
 * Draws a real, live driving route in-app (Google Directions API) with
 * distance/ETA and next-turn hints, so the rider doesn't need to leave
 * the app just to see where they're going. "Open in Maps" is still
 * offered as a fallback for full voice-guided turn-by-turn navigation.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Alert,
  TouchableOpacity, Modal, KeyboardAvoidingView, Platform,
  Linking, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import {
  ZestoBrand, Card, Button, InfoRow, Divider, StatusPill,
  ConnectionBanner, Toast, StepIndicator, LoadingScreen,
} from '../components';
import { useAuth } from '../services/AuthContext';
import { RiderApi } from '../services/api';
import { on } from '../services/socket';
import { useConnectionStatus } from '../hooks/useSocket';
import { getDirections, distanceMeters } from '../services/directions';
import { formatCurrency, isValidCode, formatDateTime } from '../utils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_HEIGHT * 0.42;

const STEPS = ['To Restaurant', 'Pick Up Order', 'Deliver'];
const STEP_TO_RESTAURANT = 0;
const STEP_AT_RESTAURANT = 1;
const STEP_TO_CUSTOMER   = 2;

export default function ActiveDeliveryScreen({ navigation, route }) {
  const { connected, reconnecting } = useConnectionStatus();
  const [delivery,    setDelivery]    = useState(route.params?.delivery || null);
  const [step,        setStep]        = useState(STEP_TO_RESTAURANT);
  const [loading,     setLoading]     = useState(!route.params?.delivery);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [pickupVisible, setPickupVisible] = useState(false);
  const [pickupCode,    setPickupCode]    = useState('');
  const [pickupCodeError, setPickupCodeError] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [code,        setCode]        = useState('');
  const [codeError,   setCodeError]   = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [riderLocation, setRiderLocation]   = useState(null);
  const [routeCoords, setRouteCoords]       = useState([]);
  const [routeInfo,   setRouteInfo]         = useState(null); // { distanceText, durationText, nextInstruction }
  const [routeLoading, setRouteLoading]     = useState(false);
  const lastRouteOriginRef = useRef(null);
  const lastRouteDestRef   = useRef(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const mapRef = useRef(null);
  const bottomAnim = useRef(new Animated.Value(0)).current;

  const showToast = (message, type = 'info') => setToast({ visible: true, message, type });

  // ── Track rider location live ────────────────────────────────
  // Was a single one-shot fetch on mount — the map's "you are here" dot
  // never moved after that. Now it's watched continuously (throttled)
  // so the rider's position — and the in-app route below — stay current
  // as they actually drive.
  useEffect(() => {
    let subscription;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setRiderLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 8000, distanceInterval: 25 },
          (update) => {
            setRiderLocation({ latitude: update.coords.latitude, longitude: update.coords.longitude });
          }
        );
      } catch {}
    })();
    return () => subscription?.remove();
  }, []);

  // ── Load delivery if not passed ────────────────────────────────
  const loadDelivery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await RiderApi.getActiveDelivery();
      if (res?.success) {
        if (res.data) {
          setDelivery(res.data);
          if (res.data.delivery_status === 'picked_up' || res.data.delivery_status === 'on_the_way') {
            setStep(STEP_TO_CUSTOMER);
          }
        } else {
          navigation.replace('Main');
        }
      }
    } catch { showToast('Failed to load delivery', 'error'); }
    finally { setLoading(false); }
  }, [navigation]);

  useEffect(() => {
    if (!route.params?.delivery) { loadDelivery(); return; }
    const d = route.params.delivery;
    if (d.delivery_status === 'picked_up' || d.delivery_status === 'on_the_way') setStep(STEP_TO_CUSTOMER);
  }, []);

  // Animate bottom sheet on step change
  useEffect(() => {
    Animated.spring(bottomAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }).start();
  }, [step]);

  // ── Socket: cancellation ──────────────────────────────────────
  useEffect(() => {
    const unsub = on('order:update', (data) => {
      if (delivery && (data?.orderId || data?.order_id) === delivery.order_id && data.status === 'cancelled') {
        Alert.alert('Order Cancelled', 'This order has been cancelled.',
          [{ text: 'OK', onPress: () => navigation.replace('Main') }]);
      }
    });
    return unsub;
  }, [delivery, navigation]);

  // ── Fit map to markers ─────────────────────────────────────────
  const fitDoneForStepRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || !delivery) return;
    // Only auto-fit once per step, not on every live location tick —
    // continuous re-fitting while the rider is actually driving fights
    // any manual pan/zoom and feels like the map is fighting you. The
    // 🎯 recenter button below covers "snap back to my position".
    if (fitDoneForStepRef.current === step) return;

    const coords = [];
    if (riderLocation) coords.push(riderLocation);
    if (delivery.restaurant_lat && delivery.restaurant_lng)
      coords.push({ latitude: Number(delivery.restaurant_lat), longitude: Number(delivery.restaurant_lng) });
    if (step === STEP_TO_CUSTOMER && delivery.delivery_lat && delivery.delivery_lng)
      coords.push({ latitude: Number(delivery.delivery_lat), longitude: Number(delivery.delivery_lng) });
    if (coords.length > 0) {
      fitDoneForStepRef.current = step;
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true });
      }, 500);
    }
  }, [delivery, riderLocation, step]);

  // ── Fetch a real driving route for the current leg ─────────────
  // Draws the actual road route (not just a straight dashed line)
  // between the rider and wherever they're headed next, so the map
  // itself is a real navigation view instead of just an overview.
  useEffect(() => {
    if (!delivery || !riderLocation) return;

    const destination = step === STEP_TO_CUSTOMER
      ? (delivery.delivery_lat && delivery.delivery_lng
          ? { latitude: Number(delivery.delivery_lat), longitude: Number(delivery.delivery_lng) }
          : null)
      : (delivery.restaurant_lat && delivery.restaurant_lng
          ? { latitude: Number(delivery.restaurant_lat), longitude: Number(delivery.restaurant_lng) }
          : null);

    if (!destination) return;

    // Don't refetch on every tiny GPS jitter — only once the rider has
    // actually moved a meaningful distance, or the destination changed
    // (e.g. picked up and now heading to the customer instead).
    const destChanged  = !lastRouteDestRef.current || distanceMeters(destination, lastRouteDestRef.current) > 10;
    const originMoved  = distanceMeters(riderLocation, lastRouteOriginRef.current) > 40;
    if (!destChanged && !originMoved) return;

    if (destChanged) { setRouteCoords([]); setRouteInfo(null); }

    let cancelled = false;
    setRouteLoading(true);
    getDirections(riderLocation, destination).then(result => {
      if (cancelled) return;
      setRouteLoading(false);
      if (result) {
        setRouteCoords(result.coordinates);
        setRouteInfo(result);
        lastRouteOriginRef.current = riderLocation;
        lastRouteDestRef.current = destination;
      }
    });
    return () => { cancelled = true; };
  }, [delivery, riderLocation, step]);

  // ── Navigation helpers ─────────────────────────────────────────
  function openNavigation(lat, lng, address, label) {
    let url;
    if (lat && lng) {
      if (Platform.OS === 'ios') {
        url = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
        Linking.canOpenURL(url).then(ok => {
          if (!ok) url = `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
          Linking.openURL(url);
        });
        return;
      }
      url = `google.navigation:q=${lat},${lng}&mode=d`;
      Linking.canOpenURL(url).then(ok => {
        if (!ok) url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
        Linking.openURL(url);
      });
    } else if (address) {
      const q = encodeURIComponent(address);
      url = `https://www.google.com/maps/search/?api=1&query=${q}`;
      Linking.openURL(url);
    }
  }

  // Opening navigation used to also immediately mark the rider as
  // "at the restaurant" — so tapping the button jumped straight to the
  // pickup-code screen regardless of whether navigation even opened
  // (and regardless of the rider having actually arrived yet). Arrival
  // is now its own explicit action — see "I've Arrived" below.
  function navigateToRestaurant() {
    if (!delivery) return;
    openNavigation(delivery.restaurant_lat, delivery.restaurant_lng, delivery.restaurant_address, delivery.restaurant_name);
  }

  function navigateToCustomer() {
    if (!delivery) return;
    openNavigation(delivery.delivery_lat, delivery.delivery_lng, delivery.delivery_address, 'Customer');
  }

  // ── Pickup ────────────────────────────────────────────────────
  // The restaurant reads a 6-digit pickup code aloud when handing over
  // the order — entering it here is what actually confirms pickup. This
  // prevents disputes/fraud between the restaurant and the rider (e.g. a
  // rider claiming they never received the order, or being marked as
  // having picked up something they never got).
  async function handleConfirmPickup() {
    setPickupCodeError('');
    if (!isValidCode(pickupCode)) { setPickupCodeError('Enter the 6-digit code from the restaurant.'); return; }
    setPickupLoading(true);
    try {
      await RiderApi.markPickedUp(delivery.order_id, pickupCode.trim());
      setPickupVisible(false);
      setDelivery(p => ({ ...p, delivery_status: 'picked_up' }));
      setStep(STEP_TO_CUSTOMER);
      showToast('✅  Order picked up! Now deliver to the customer.', 'success');
    } catch (err) { setPickupCodeError(err.message || 'Incorrect code. Try again.'); }
    finally { setPickupLoading(false); }
  }

  // ── Confirm delivery ──────────────────────────────────────────
  async function handleConfirmDelivery() {
    setCodeError('');
    if (!isValidCode(code)) { setCodeError('Enter the 6-digit code from the customer.'); return; }
    setConfirmLoading(true);
    try {
      await RiderApi.confirmDelivery(delivery.order_id, code.trim());
      setConfirmVisible(false);
      showToast('🎉  Delivery confirmed! Great job!', 'success');
      setTimeout(() => navigation.replace('Main'), 2200);
    } catch (err) { setCodeError(err.message || 'Incorrect code. Try again.'); }
    finally { setConfirmLoading(false); }
  }

  if (loading || !delivery) return <LoadingScreen message="Loading delivery…" />;

  // Map markers
  const restaurantCoord = delivery.restaurant_lat && delivery.restaurant_lng
    ? { latitude: Number(delivery.restaurant_lat), longitude: Number(delivery.restaurant_lng) }
    : null;
  const customerCoord = delivery.delivery_lat && delivery.delivery_lng
    ? { latitude: Number(delivery.delivery_lat), longitude: Number(delivery.delivery_lng) }
    : null;

  const mapInitial = restaurantCoord || customerCoord || { latitude: 0.3476, longitude: 32.5825 }; // Kampala default

  // Whether we have anything at all to navigate/route with for the
  // restaurant leg — either real coordinates, or at least a text
  // address to fall back to a Maps search.
  const hasRestaurantLocation = !!restaurantCoord || !!delivery.restaurant_address;

  // Parse items
  let items = delivery.items || [];
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }

  return (
    <SafeAreaView style={styles.safe} edges={['top','left','right']}>
      <ConnectionBanner connected={connected} reconnecting={reconnecting} />
      <Toast {...toast} onHide={() => setToast(p=>({...p,visible:false}))} />

      {/* ── MAP ────────────────────────────────────────────────── */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            ...mapInitial,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          showsUserLocation
          followsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {/* Restaurant marker */}
          {restaurantCoord && (
            <Marker coordinate={restaurantCoord} title={delivery.restaurant_name} description="Pickup point">
              <View style={styles.markerRestaurant}>
                <Text style={styles.markerText}>🏪</Text>
              </View>
            </Marker>
          )}

          {/* Customer marker (only shown after pickup) */}
          {customerCoord && step === STEP_TO_CUSTOMER && (
            <Marker coordinate={customerCoord} title="Customer" description={delivery.delivery_address}>
              <View style={styles.markerCustomer}>
                <Text style={styles.markerText}>📍</Text>
              </View>
            </Marker>
          )}

          {/* Real driving route (falls back to a straight dashed line
              while it's loading or if the Directions API is unavailable) */}
          {routeCoords.length > 1 ? (
            <Polyline
              coordinates={routeCoords}
              strokeColor={Colors.orange}
              strokeWidth={5}
            />
          ) : (
            <>
              {restaurantCoord && customerCoord && step === STEP_TO_CUSTOMER && (
                <Polyline
                  coordinates={[restaurantCoord, customerCoord]}
                  strokeColor={Colors.orange}
                  strokeWidth={3}
                  lineDashPattern={[8, 4]}
                />
              )}
              {riderLocation && restaurantCoord && step !== STEP_TO_CUSTOMER && (
                <Polyline
                  coordinates={[riderLocation, restaurantCoord]}
                  strokeColor={Colors.orange}
                  strokeWidth={3}
                  lineDashPattern={[8, 4]}
                />
              )}
            </>
          )}
        </MapView>

        {/* Map top overlay: order number + status */}
        <View style={styles.mapOverlay}>
          <View style={styles.mapChip}>
            <Text style={styles.mapChipText}>{delivery.order_number}</Text>
          </View>
          <StatusPill status={delivery.delivery_status || 'assigned'} />
        </View>

        {/* In-app route info: live distance/ETA + next turn, right on
            the map — this is the "don't leave the app" navigation view */}
        {(routeInfo || routeLoading) && (
          <View style={styles.routeBanner}>
            {routeLoading && !routeInfo ? (
              <Text style={styles.routeBannerMeta}>📡  Finding route…</Text>
            ) : (
              <>
                <View style={styles.routeBannerTop}>
                  <Text style={styles.routeBannerEta}>{routeInfo.durationText}</Text>
                  <Text style={styles.routeBannerDot}>·</Text>
                  <Text style={styles.routeBannerMeta}>{routeInfo.distanceText}</Text>
                  <Text style={styles.routeBannerDest}>
                    {step === STEP_TO_CUSTOMER ? '  to customer' : '  to restaurant'}
                  </Text>
                </View>
                {routeInfo.nextInstruction && (
                  <Text style={styles.routeBannerInstruction} numberOfLines={1}>
                    🧭  {routeInfo.nextInstruction}
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Recenter button */}
        {riderLocation && (
          <TouchableOpacity
            style={styles.recenterBtn}
            onPress={() => mapRef.current?.animateToRegion({ ...riderLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400)}
            activeOpacity={0.85}
          >
            <Text style={styles.recenterBtnIcon}>🎯</Text>
          </TouchableOpacity>
        )}

        {/* Open in Google/Apple Maps — for full voice-guided turn-by-turn.
            The map above already shows the live route + ETA in-app; this
            is the fallback for when the rider wants spoken directions. */}
        <TouchableOpacity
          style={styles.navBtn}
          onPress={step < STEP_TO_CUSTOMER ? navigateToRestaurant : navigateToCustomer}
          activeOpacity={0.85}
        >
          <Text style={styles.navBtnIcon}>🗺️</Text>
          <Text style={styles.navBtnText}>Open in Maps</Text>
        </TouchableOpacity>
      </View>

      {/* ── BOTTOM SHEET ───────────────────────────────────────── */}
      <Animated.View style={[styles.sheet, {
        transform: [{ translateY: bottomAnim.interpolate({ inputRange:[0,1], outputRange:[60,0] }) }]
      }]}>
        {/* Step indicator */}
        <View style={styles.sheetHandle} />
        <StepIndicator steps={STEPS} currentStep={step} />

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={styles.sheetContent}>

            {/* ── Step 0 + 1: Restaurant block ─────────────────── */}
            <Card style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.blockIcon}>🏪</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockTitle}>{delivery.restaurant_name}</Text>
                  <Text style={styles.blockSub}>{delivery.restaurant_address}</Text>
                </View>
              </View>

              {delivery.restaurant_phone && (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => Linking.openURL(`tel:${delivery.restaurant_phone}`)}
                >
                  <Text style={styles.callBtnText}>📞  Call Restaurant</Text>
                </TouchableOpacity>
              )}

              {/* Items */}
              {items.length > 0 && (
                <>
                  <Divider />
                  <Text style={styles.itemsHeading}>Order Items</Text>
                  {items.map((item, i) => (
                    <View key={i} style={styles.itemRow}>
                      <Text style={styles.itemName}>{item.qty}×  {item.name}</Text>
                      <Text style={styles.itemPrice}>{formatCurrency((item.price || 0) * (item.qty || 1))}</Text>
                    </View>
                  ))}
                </>
              )}

              <Divider />

              {step < STEP_TO_CUSTOMER && (
                <View style={{ gap: Spacing.sm }}>
                  {!hasRestaurantLocation && (
                    <View style={styles.locationWarning}>
                      <Text style={styles.locationWarningText}>
                        ⚠️ This restaurant hasn't set their location yet, so in-app navigation isn't available. Call them for directions.
                      </Text>
                    </View>
                  )}
                  {hasRestaurantLocation && (
                    <Button title="Navigate to Restaurant" icon="🗺️"
                      onPress={navigateToRestaurant} variant="outline" size="md" />
                  )}
                  <Button title="Enter Pickup Code to Confirm" icon="🔑"
                    onPress={() => { setPickupCode(''); setPickupCodeError(''); setPickupVisible(true); }}
                    size="md" variant="success" />
                </View>
              )}
              {step === STEP_TO_CUSTOMER && (
                <View style={styles.doneBlock}>
                  <Text style={styles.doneTick}>✓</Text>
                  <Text style={styles.doneText}>Order picked up</Text>
                </View>
              )}
            </Card>

            {/* ── Step 2: Customer block ─────────────────────── */}
            <Card style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.blockIcon}>👤</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockTitle}>{delivery.customer_name || 'Customer'}</Text>
                  <Text style={styles.blockSub}>{delivery.delivery_address}</Text>
                </View>
              </View>

              {delivery.customer_phone && (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => Linking.openURL(`tel:${delivery.customer_phone}`)}
                >
                  <Text style={styles.callBtnText}>📞  Call Customer</Text>
                </TouchableOpacity>
              )}

              {delivery.notes ? (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>📝  Delivery Notes</Text>
                  <Text style={styles.notesText}>{delivery.notes}</Text>
                </View>
              ) : null}

              <Divider />

              <View style={styles.feesRow}>
                <View style={styles.feeItem}>
                  <Text style={styles.feeLabel}>Your Earnings</Text>
                  <Text style={styles.feeValue}>{formatCurrency(delivery.delivery_fee)}</Text>
                </View>
                <View style={styles.feeItem}>
                  <Text style={styles.feeLabel}>Order Total</Text>
                  <Text style={[styles.feeValue, { color: Colors.textSec, fontSize: Typography.base }]}>
                    {formatCurrency(delivery.total)}
                  </Text>
                </View>
              </View>

              {step === STEP_TO_CUSTOMER && (
                <View style={{ gap: Spacing.sm }}>
                  <Button title="Navigate to Customer" icon="🗺️"
                    onPress={navigateToCustomer} variant="outline" size="md" />
                  <Button title="Enter Delivery Code to Confirm" icon="🔑"
                    onPress={() => { setCode(''); setCodeError(''); setConfirmVisible(true); }}
                    size="md" variant="success" />
                </View>
              )}

              {step < STEP_TO_CUSTOMER && (
                <View style={styles.lockedBlock}>
                  <Text style={styles.lockedText}>🔒  Available after pickup</Text>
                </View>
              )}
            </Card>

          </View>
        </ScrollView>
      </Animated.View>

      {/* ── Pickup Confirmation Modal ───────────────────────────── */}
      <Modal visible={pickupVisible} transparent animationType="slide" onRequestClose={() => setPickupVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Confirm Pickup</Text>
              <Text style={styles.modalSub}>
                Ask restaurant staff for the <Text style={{ fontWeight: '800', color: Colors.orange }}>6-digit pickup code</Text> and enter it below.
              </Text>

              <TextInput
                style={[styles.codeInput, pickupCodeError && { borderColor: Colors.danger }]}
                value={pickupCode}
                onChangeText={t => { setPickupCode(t.replace(/\D/g,'').slice(0,6)); setPickupCodeError(''); }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
                autoFocus
              />

              {!!pickupCodeError && <Text style={styles.codeError}>{pickupCodeError}</Text>}

              <View style={styles.modalBtns}>
                <Button title="Cancel" variant="outline" size="md" style={{ flex: 1 }}
                  onPress={() => setPickupVisible(false)} />
                <Button title="Confirm Pickup" size="md" style={{ flex: 1 }}
                  disabled={pickupCode.length !== 6 || pickupLoading}
                  loading={pickupLoading}
                  onPress={handleConfirmPickup} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Delivery Confirmation Modal ─────────────────────────── */}
      <Modal visible={confirmVisible} transparent animationType="slide" onRequestClose={() => setConfirmVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Confirm Delivery</Text>
              <Text style={styles.modalSub}>
                Ask the customer for their <Text style={{ fontWeight: '800', color: Colors.orange }}>6-digit code</Text> and enter it below.
              </Text>

              <TextInput
                style={[styles.codeInput, codeError && { borderColor: Colors.danger }]}
                value={code}
                onChangeText={t => { setCode(t.replace(/\D/g,'').slice(0,6)); setCodeError(''); }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
                autoFocus
              />

              {!!codeError && <Text style={styles.codeError}>{codeError}</Text>}

              <View style={styles.modalBtns}>
                <Button title="Cancel" variant="outline" size="md" style={{ flex: 1 }}
                  onPress={() => setConfirmVisible(false)} />
                <Button title="Confirm Delivery" size="md" style={{ flex: 1 }}
                  disabled={code.length !== 6 || confirmLoading}
                  loading={confirmLoading}
                  onPress={handleConfirmDelivery} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: Colors.bg },
  mapContainer:  { height: MAP_HEIGHT, position: 'relative' },
  map:           { flex: 1 },
  mapOverlay:    {
    position: 'absolute', top: Spacing.md, left: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  mapChip: {
    backgroundColor: Colors.dark, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 6, ...Shadows.md,
  },
  mapChipText:  { color: '#fff', fontSize: Typography.sm, fontWeight: Typography.extrabold },
  navBtn: {
    position: 'absolute', bottom: Spacing.md, right: Spacing.md,
    backgroundColor: Colors.orange, borderRadius: Radius.full,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, ...Shadows.orange,
  },
  navBtnIcon:  { fontSize: 18 },
  navBtnText:  { color: '#fff', fontWeight: Typography.extrabold, fontSize: Typography.sm },
  routeBanner: {
    position: 'absolute', top: 56, left: Spacing.md, right: Spacing.md,
    backgroundColor: 'rgba(26,26,46,0.92)', borderRadius: Radius.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, ...Shadows.md,
  },
  routeBannerTop:  { flexDirection: 'row', alignItems: 'baseline' },
  routeBannerEta:  { color: '#fff', fontSize: Typography.base, fontWeight: Typography.extrabold },
  routeBannerDot:  { color: Colors.textMuted, marginHorizontal: 5, fontSize: Typography.base },
  routeBannerMeta: { color: '#fff', fontSize: Typography.sm, fontWeight: Typography.semibold },
  routeBannerDest: { color: Colors.textMuted, fontSize: Typography.sm },
  routeBannerInstruction: { color: '#fff', fontSize: Typography.xs, marginTop: 2, opacity: 0.9 },
  recenterBtn: {
    position: 'absolute', bottom: 76, right: Spacing.md,
    backgroundColor: '#fff', borderRadius: Radius.full,
    width: 42, height: 42, alignItems: 'center', justifyContent: 'center', ...Shadows.md,
  },
  recenterBtnIcon: { fontSize: 18 },
  markerRestaurant: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', ...Shadows.md,
  },
  markerCustomer: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff', ...Shadows.md,
  },
  markerText: { fontSize: 20 },

  sheet: {
    flex: 1, backgroundColor: Colors.bg,
    borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    marginTop: -Radius.lg,
    ...Shadows.lg,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: Colors.border,
    borderRadius: 2, alignSelf: 'center', marginTop: Spacing.sm, marginBottom: 0,
  },
  sheetContent: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 80 },

  block: { gap: 0, padding: Spacing.base },
  blockHeader: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md, alignItems: 'flex-start' },
  blockIcon: { fontSize: 28, marginTop: -2 },
  blockTitle: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.text },
  blockSub: { fontSize: Typography.sm, color: Colors.textSec, marginTop: 2, lineHeight: 19 },

  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.infoBg, borderRadius: Radius.sm,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  callBtnText: { color: Colors.info, fontWeight: Typography.bold, fontSize: Typography.sm },

  itemsHeading: { fontSize: Typography.sm, fontWeight: Typography.extrabold, color: Colors.text, marginBottom: Spacing.xs },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itemName: { fontSize: Typography.sm, color: Colors.text, flex: 1 },
  itemPrice: { fontSize: Typography.sm, color: Colors.textSec, fontWeight: Typography.semibold },

  doneBlock: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.successBg, borderRadius: Radius.sm, padding: Spacing.md,
  },
  doneTick: { color: Colors.success, fontSize: 20, fontWeight: Typography.extrabold },
  doneText: { color: Colors.successDark, fontWeight: Typography.bold, fontSize: Typography.sm },

  locationWarning: {
    backgroundColor: '#FFFBEB', borderRadius: Radius.sm, padding: Spacing.md,
    borderWidth: 1, borderColor: '#FDE68A', gap: Spacing.sm,
  },
  locationWarningText: { color: '#92400E', fontSize: Typography.sm, lineHeight: 19 },

  notesBox: {
    backgroundColor: Colors.warningBg, borderRadius: Radius.sm,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  notesLabel: { fontSize: Typography.xs, fontWeight: Typography.extrabold, color: Colors.warning, marginBottom: 4 },
  notesText: { fontSize: Typography.sm, color: Colors.text, lineHeight: 19 },

  feesRow: { flexDirection: 'row', gap: Spacing.base, marginBottom: Spacing.md },
  feeItem: { flex: 1 },
  feeLabel: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.extrabold, textTransform: 'uppercase', letterSpacing: 0.5 },
  feeValue: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.orange, marginTop: 2 },

  lockedBlock: {
    backgroundColor: Colors.bg, borderRadius: Radius.sm,
    padding: Spacing.md, alignItems: 'center',
  },
  lockedText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingBottom: 40, gap: Spacing.md, ...Shadows.xl,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.text, textAlign: 'center' },
  modalSub: { fontSize: Typography.sm, color: Colors.textSec, textAlign: 'center', lineHeight: 21 },
  codeInput: {
    height: 88, borderWidth: 3, borderColor: Colors.border, borderRadius: Radius.md,
    fontSize: 46, fontWeight: Typography.extrabold, color: Colors.text,
    backgroundColor: Colors.bg, letterSpacing: 14, ...Shadows.sm,
  },
  codeError: { color: Colors.danger, fontSize: Typography.sm, fontWeight: Typography.semibold, textAlign: 'center' },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm },
});

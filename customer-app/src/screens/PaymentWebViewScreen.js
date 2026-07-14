/**
 * screens/PaymentWebViewScreen.js — Zesto Customer
 * Opens the Pesapal-hosted payment page in a WebView (same gateway used by
 * the web frontend) and polls the backend for payment status, since Pesapal
 * redirects to a web callback URL that a mobile app can't intercept directly.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, BackHandler, Platform, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '../theme';
import { Button } from '../components';
import { PaymentApi } from '../services/api';
import { on } from '../services/socket';
import { useCart } from '../services/CartContext';

export default function PaymentWebViewScreen({ route, navigation }) {
  const { orderId, method, paymentUrl } = route.params;
  const { clearCart } = useCart();
  const [redirectUrl, setRedirectUrl] = useState(paymentUrl || null);
  const [phase, setPhase] = useState(paymentUrl ? 'webview' : 'initiating'); // initiating | webview | verifying | success | failed
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    if (paymentUrl) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await PaymentApi.initiatePesapal(orderId, method);
        if (cancelled) return;
        if (!res.success || !res.redirect_url) throw new Error(res.message || 'Could not start payment.');
        setRedirectUrl(res.redirect_url);
        setPhase('webview');
      } catch (err) {
        if (!cancelled) { setError(err.message || 'Could not start payment.'); setPhase('failed'); }
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, method, paymentUrl]);

  // Poll payment status while the WebView is open — Pesapal's callback lands
  // on a web page we don't control from inside the app.
  useEffect(() => {
    if (phase !== 'webview') return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await PaymentApi.getStatusForOrder(orderId);
        const status = res?.data?.status;
        if (status === 'verified') {
          stopPolling();
          clearCart();
          setPhase('success');
        } else if (status === 'failed' || status === 'expired') {
          stopPolling();
          setPhase('failed');
          setError('Payment was not completed.');
        }
      } catch {
        // Transient network errors are fine — keep polling
      }
    }, 3000);
    return stopPolling;
  }, [phase, orderId, stopPolling, clearCart]);

  // Real-time confirmation via socket (faster than polling when it arrives)
  useEffect(() => on('payment:status', (data) => {
    if (String(data?.order_id) === String(orderId) || String(data?.orderId) === String(orderId)) {
      if (data.status === 'verified') { stopPolling(); clearCart(); setPhase('success'); }
      if (data.status === 'failed') { stopPolling(); setPhase('failed'); setError('Payment failed.'); }
    }
  }), [orderId, stopPolling, clearCart]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'webview') { setPhase('failed'); setError('Payment cancelled.'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [phase]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  if (phase === 'initiating') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.orange} />
        <Text style={styles.loadingText}>Starting secure payment…</Text>
      </View>
    );
  }

  if (phase === 'success') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ fontSize: 64, marginBottom: Spacing.md }}>🎉</Text>
        <Text style={styles.resultTitle}>Payment Confirmed!</Text>
        <Text style={styles.resultSub}>Your order has been placed and the restaurant has been notified.</Text>
        <Button
          title="Track My Order"
          onPress={() => navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'OrderDetail', params: { orderId } }] })}
          style={{ marginTop: Spacing.lg }}
          icon="📦"
        />
      </SafeAreaView>
    );
  }

  if (phase === 'failed') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ fontSize: 64, marginBottom: Spacing.md }}>😕</Text>
        <Text style={styles.resultTitle}>Payment Not Completed</Text>
        <Text style={styles.resultSub}>{error || 'Something went wrong with your payment.'}</Text>
        <Button title="Try Again" onPress={() => setPhase('initiating')} style={{ marginTop: Spacing.lg }} />
        <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'OrdersTab' })} style={{ marginTop: Spacing.md }}>
          <Text style={styles.linkText}>View my orders instead</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ fontSize: 24, marginBottom: Spacing.md }}>Secure Payment</Text>
        <Text style={styles.resultSub}>Pesapal payments are opened in your browser on web.</Text>
        <Button
          title="Open Payment Page"
          onPress={() => Linking.openURL(redirectUrl)}
          style={{ marginTop: Spacing.lg }}
        />
        <TouchableOpacity onPress={() => setPhase('failed')} style={{ marginTop: Spacing.md }}>
          <Text style={styles.linkText}>Cancel payment</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={styles.webHeader}>
        <TouchableOpacity onPress={() => { setPhase('failed'); setError('Payment cancelled.'); }} style={styles.closeBtn}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.webHeaderTitle}>Secure Payment</Text>
        <View style={{ width: 36 }} />
      </View>
      <WebView
        source={{ uri: redirectUrl }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.orange} />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg, padding: Spacing.xl },
  loadingText: { marginTop: 14, color: Colors.textSec, fontSize: Typography.base },
  resultTitle: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.text, marginBottom: Spacing.sm, textAlign: 'center' },
  resultSub: { fontSize: Typography.base, color: Colors.textSec, textAlign: 'center', lineHeight: 21 },
  linkText: { color: Colors.orange, fontWeight: Typography.semibold },
  webHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  webHeaderTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.text },
});

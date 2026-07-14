/**
 * screens/CheckoutScreen.js — Zesto Customer
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { Button, Card } from '../components';
import {
  OrderApi,
  PaymentApi,
  SettingsApi,
} from '../services/api';
import { formatCurrency } from '../utils';
import { useCart } from '../services/CartContext';

const PAYMENT_METHODS = [
  { key: 'mobile_money', label: '📱 Mobile Money', sub: 'MTN / Airtel via Pesapal' },
  { key: 'card', label: '💳 Card', sub: 'Visa / Mastercard via Pesapal' },
];

export default function CheckoutScreen({ navigation }) {
  const { items, subtotal, clearCart } = useCart();
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState('mobile_money');
  const [deliveryFee, setDeliveryFee] = useState(5000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await SettingsApi.getDeliveryFee();
        if (res?.success) setDeliveryFee(res.data.delivery_fee);
      } catch {}
    })();
  }, []);

  const total = subtotal + Number(deliveryFee || 0);

  async function handlePlaceOrder() {
    setLoading(true);
    setError('');

    try {
      const res = await OrderApi.create({
        items,
        delivery_address: address.trim(),
        payment_method: method,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        throw new Error(res.message || 'Failed to place order.');
      }

      const payment = await PaymentApi.initiatePesapal(res.order_id, method);
      if (!payment.success) {
        throw new Error(payment.message || 'Failed to initiate payment.');
      }

      navigation.replace('PaymentWebView', {
        orderId: res.order_id,
        method,
        paymentUrl:
          payment.redirect_url ||
          payment.data?.redirect_url ||
          payment.data?.redirectUrl,
      });
    } catch (err) {
      setError(err.message || 'Unable to place order.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 180 }}>
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️  {error}</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <Card style={{ marginBottom: Spacing.lg }} shadow="xs">
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="e.g. Plot 12, Kira Road, Kampala"
              placeholderTextColor={Colors.textMuted}
              style={styles.textArea}
              multiline
            />
          </Card>

          <Text style={styles.sectionTitle}>Delivery Notes (optional)</Text>
          <Card style={{ marginBottom: Spacing.lg }} shadow="xs">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Gate code, landmark, call on arrival…"
              placeholderTextColor={Colors.textMuted}
              style={styles.textArea}
              multiline
            />
          </Card>

          <Text style={styles.sectionTitle}>Payment Method</Text>
          {PAYMENT_METHODS.map(m => (
            <TouchableOpacity
              key={m.key}
              onPress={() => setMethod(m.key)}
              activeOpacity={0.85}
              style={[styles.methodRow, method === m.key && styles.methodRowActive]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.methodLabel}>{m.label}</Text>
                <Text style={styles.methodSub}>{m.sub}</Text>
              </View>
              <View style={[styles.radio, method === m.key && styles.radioActive]}>
                {method === m.key && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}

          <Text style={styles.sectionTitle}>Order Summary</Text>
          <Card shadow="xs">
            <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
            <SummaryRow label="Delivery Fee" value={formatCurrency(deliveryFee)} />
            <View style={styles.divider} />
            <SummaryRow label="Total" value={formatCurrency(total)} bold />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <Button title={`Pay ${formatCurrency(total)}`} onPress={handlePlaceOrder} loading={loading} size="lg" icon="🔒" />
      </View>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, bold }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: Typography.extrabold, color: Colors.text }]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && { fontSize: Typography.lg, fontWeight: Typography.extrabold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.text },
  errorBox: {
    backgroundColor: Colors.dangerBg, borderRadius: Radius.sm, padding: Spacing.md,
    marginBottom: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.danger,
  },
  errorText: { color: Colors.danger, fontSize: Typography.sm, fontWeight: Typography.semibold },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.text, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4 },
  textArea: { minHeight: 60, fontSize: Typography.base, color: Colors.text, textAlignVertical: 'top' },
  methodRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    marginBottom: Spacing.sm, ...Shadows.xs,
  },
  methodRowActive: { borderColor: Colors.orange, backgroundColor: Colors.orangePale },
  methodLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.text },
  methodSub: { fontSize: Typography.xs, color: Colors.textSec, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.orange },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.orange },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: Typography.sm, color: Colors.textSec },
  summaryValue: { fontSize: Typography.sm, color: Colors.text, fontWeight: Typography.semibold },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 6 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.surface,
    padding: Spacing.base, borderTopWidth: 1, borderTopColor: Colors.border, ...Shadows.lg,
  },
});

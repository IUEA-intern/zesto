/**
 * screens/ProfileScreen.js — Zesto Rider
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, RefreshControl, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { ZestoBrand, RiderChip, Card, Button, StatusPill, InfoRow, Divider } from '../components';
import { useAuth } from '../services/AuthContext';
import { useSettings } from '../services/SettingsContext';
import { formatDateTime } from '../utils';

export default function ProfileScreen() {
  const { user, riderProfile, isApproved, isAvailable, logout, refreshProfile } = useAuth();
  const { settings } = useSettings();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  }, [refreshProfile]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?',
      [{ text: 'Cancel', style: 'cancel' },
       { text: 'Sign Out', style: 'destructive', onPress: logout }]);
  };

  const vehicleLabel = { bicycle: '🚲  Bicycle', boda_boda: '🏍️  Boda Boda', car: '🚗  Car' };
  const name = riderProfile?.name || user?.name || 'Rider';

  return (
    <SafeAreaView style={styles.safe} edges={['top','left','right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.orange} />}
      >
        {/* Avatar header */}
        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.heroName}>{name}</Text>
          <Text style={styles.heroEmail}>{riderProfile?.email || user?.email}</Text>
          <View style={styles.heroBadges}>
            <RiderChip />
            <StatusPill status={riderProfile?.status || 'pending'} />
          </View>
        </View>

        {/* Approval warning */}
        {!isApproved && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>⏳  Account Pending Approval</Text>
            <Text style={styles.alertText}>
              Your account is awaiting review. Contact the Zesto team to get approved faster.
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${settings.support_phone}`)} style={styles.alertBtn}>
              <Text style={styles.alertBtnText}>📞  Call Zesto Team</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Status card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Availability</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isAvailable ? Colors.success : Colors.textMuted }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusLabel}>{isAvailable ? 'Online — Receiving orders' : 'Offline'}</Text>
              <Text style={styles.statusSub}>{isApproved ? 'Toggle on the Home tab' : 'Approval required to go online'}</Text>
            </View>
          </View>
        </Card>

        {/* Account info */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Account Details</Text>
          <InfoRow icon="👤" label="Name"   value={name} />
          <InfoRow icon="📧" label="Email"  value={riderProfile?.email || user?.email} />
          {riderProfile?.phone && <InfoRow icon="📞" label="Phone" value={riderProfile.phone} />}
          <InfoRow icon="🎫" label="Status" value={riderProfile?.status ? riderProfile.status.charAt(0).toUpperCase() + riderProfile.status.slice(1) : '—'} />
          <InfoRow icon="📅" label="Joined" value={riderProfile?.created_at ? formatDateTime(riderProfile.created_at) : '—'} />
        </Card>

        {/* Vehicle */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Vehicle Details</Text>
          <InfoRow icon="🚗" label="Type"    value={vehicleLabel[riderProfile?.vehicle_type] || riderProfile?.vehicle_type || '—'} />
          {riderProfile?.vehicle_number && <InfoRow icon="🔢" label="Plate / Number" value={riderProfile.vehicle_number} />}
          {riderProfile?.national_id    && <InfoRow icon="🪪" label="National ID" value={riderProfile.national_id} />}
        </Card>

        {/* Support */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Support</Text>
          <TouchableOpacity style={styles.supportRow} onPress={() => Linking.openURL(`tel:${settings.support_phone}`)}>
            <Text style={styles.supportIcon}>📞</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.supportLabel}>Call Zesto Support</Text>
              <Text style={styles.supportSub}>{settings.support_phone}</Text>
            </View>
            <Text style={styles.supportArrow}>›</Text>
          </TouchableOpacity>
          <Divider />
          <TouchableOpacity style={styles.supportRow} onPress={() => Linking.openURL(`mailto:${settings.support_email}`)}>
            <Text style={styles.supportIcon}>✉️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.supportLabel}>Email Support</Text>
              <Text style={styles.supportSub}>{settings.support_email}</Text>
            </View>
            <Text style={styles.supportArrow}>›</Text>
          </TouchableOpacity>
        </Card>

        {/* About */}
        <Card style={styles.card}>
          <View style={styles.aboutRow}><ZestoBrand size="sm" /><RiderChip /></View>
          <Text style={styles.aboutText}>Zesto Rider App v1.1.0{'\n'}© 2024 Zesto · Uganda</Text>
        </Card>

        <Button title="Sign Out" variant="danger" onPress={handleLogout} icon="🚪" style={{ marginTop: Spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.base, paddingBottom: 80, gap: Spacing.md },

  heroCard: {
    backgroundColor: Colors.dark, borderRadius: Radius.lg, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.sm, ...Shadows.lg,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center', ...Shadows.orange,
  },
  avatarLetter: { fontSize: Typography.xxl, fontWeight: Typography.black, color: '#fff' },
  heroName:  { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: '#fff' },
  heroEmail: { fontSize: Typography.sm, color: Colors.textOnDarkSec },
  heroBadges: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },

  alertBox: {
    backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.base,
    borderLeftWidth: 4, borderLeftColor: Colors.warning, gap: Spacing.sm,
  },
  alertTitle: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.warning },
  alertText:  { fontSize: Typography.sm, color: Colors.text, lineHeight: 20 },
  alertBtn: {
    backgroundColor: Colors.warning, borderRadius: Radius.full,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base, alignSelf: 'flex-start',
  },
  alertBtnText: { color: '#fff', fontWeight: Typography.bold, fontSize: Typography.sm },

  card: { gap: 0 },
  cardTitle: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.text, marginBottom: Spacing.sm },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  statusDot: { width: 14, height: 14, borderRadius: 7 },
  statusLabel: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.text },
  statusSub:   { fontSize: Typography.xs, color: Colors.textSec, marginTop: 2 },

  supportRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  supportIcon: { fontSize: 22 },
  supportLabel: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.text },
  supportSub:   { fontSize: Typography.sm, color: Colors.textSec },
  supportArrow: { fontSize: Typography.lg, color: Colors.textMuted },

  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  aboutText: { fontSize: Typography.sm, color: Colors.textSec, lineHeight: 22 },
});

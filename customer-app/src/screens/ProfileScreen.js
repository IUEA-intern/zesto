/**
 * screens/ProfileScreen.js — Zesto Customer
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '../theme';
import { Card, Avatar, Button, InfoRow } from '../components';
import { useAuth } from '../services/AuthContext';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();

  function confirmLogout() {
    // Use direct logout to ensure the button fires without relying on alert callbacks.
    logout().catch(() => {});
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }}>
        <Card style={styles.profileCard} shadow="sm">
          <Avatar name={user?.name} size={64} />
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </Card>

        <Card style={{ marginTop: Spacing.lg }} shadow="xs">
          <InfoRow icon="👤" label="Full Name" value={user?.name} />
          <InfoRow icon="✉️" label="Email" value={user?.email} />
          <InfoRow icon="📱" label="Phone" value={user?.phone || 'Not set'} />
          <InfoRow icon="🎭" label="Account Type" value="Customer" />
        </Card>

        <Button
          title="Edit Profile"
          onPress={() => navigation.navigate('EditProfile')}
          variant="outline"
          size="lg"
          icon="✏️"
          style={{ marginTop: Spacing.xl }}
        />

        <Button
          title="Log Out"
          onPress={confirmLogout}
          variant="danger"
          size="lg"
          icon="🚪"
          style={{ marginTop: Spacing.md }}
        />

        <Text style={styles.footerNote}>Zesto Customer App · v1.0.0</Text>
      </ScrollView>
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
  profileCard: { alignItems: 'center', paddingVertical: Spacing.xl },
  name: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: Colors.text, marginTop: Spacing.md },
  email: { fontSize: Typography.sm, color: Colors.textSec, marginTop: 2 },
  footerNote: { textAlign: 'center', color: Colors.textMuted, fontSize: Typography.xs, marginTop: Spacing.xl },
});

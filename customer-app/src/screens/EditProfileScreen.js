/**
 * screens/EditProfileScreen.js — Zesto Customer
 * Two independent forms on one screen: profile details, and password.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { Card, Button } from '../components';
import { useAuth } from '../services/AuthContext';
import { isValidUgPhone } from '../utils';

export default function EditProfileScreen({ navigation }) {
  const { user, updateProfile, changePassword } = useAuth();

  // ── Profile details ────────────────────────────────────────────
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  async function handleSaveProfile() {
    setProfileError('');
    setProfileSuccess('');
    if (!name.trim()) { setProfileError('Full name is required.'); return; }
    if (name.trim().length < 2) { setProfileError('Name must be at least 2 characters.'); return; }
    if (phone.trim() && !isValidUgPhone(phone)) { setProfileError('Enter a valid phone number (e.g. 0712345678).'); return; }

    setProfileLoading(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() });
      setProfileSuccess('Profile updated successfully.');
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  }

  // ── Password ────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  async function handleChangePassword() {
    setPasswordError('');
    setPasswordSuccess('');
    if (!currentPassword) { setPasswordError('Enter your current password.'); return; }
    if (newPassword.length < 6) { setPasswordError('New password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('New passwords do not match.'); return; }
    if (newPassword === currentPassword) { setPasswordError('New password must be different from your current password.'); return; }

    setPasswordLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }} keyboardShouldPersistTaps="handled">

          {/* ── Profile details ─────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Profile Details</Text>
          <Card style={{ marginBottom: Spacing.xl }} shadow="xs">
            {!!profileError && (
              <View style={styles.errorBox}><Text style={styles.errorText}>⚠️  {profileError}</Text></View>
            )}
            {!!profileSuccess && (
              <View style={styles.successBox}><Text style={styles.successText}>✅  {profileSuccess}</Text></View>
            )}

            <Field label="Full Name" value={name} onChangeText={setName} placeholder="Jane Doe" />
            <Field label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XXXXXXXX" />
            <Field label="Email Address" value={user?.email || ''} editable={false} style={styles.disabledInput} />

            <Button
              title="Save Changes"
              onPress={handleSaveProfile}
              loading={profileLoading}
              size="md"
              icon="💾"
              style={{ marginTop: Spacing.sm }}
            />
          </Card>

          {/* ── Password ─────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Change Password</Text>
          <Card shadow="xs">
            {!!passwordError && (
              <View style={styles.errorBox}><Text style={styles.errorText}>⚠️  {passwordError}</Text></View>
            )}
            {!!passwordSuccess && (
              <View style={styles.successBox}><Text style={styles.successText}>✅  {passwordSuccess}</Text></View>
            )}

            <Field label="Current Password" value={currentPassword} onChangeText={setCurrentPassword}
              secureTextEntry placeholder="Enter current password" />
            <Field label="New Password (min 6 chars)" value={newPassword} onChangeText={setNewPassword}
              secureTextEntry placeholder="Enter new password" />
            <Field label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword}
              secureTextEntry placeholder="Repeat new password" onSubmitEditing={handleChangePassword} />

            <Button
              title="Update Password"
              onPress={handleChangePassword}
              loading={passwordLoading}
              size="md"
              variant="dark"
              icon="🔒"
              style={{ marginTop: Spacing.sm }}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, style, ...props }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={[styles.input, style]} placeholderTextColor={Colors.textMuted} {...props} />
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
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.text,
    marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  errorBox: {
    backgroundColor: Colors.dangerBg, borderRadius: Radius.sm, padding: Spacing.md,
    marginBottom: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.danger,
  },
  errorText: { color: Colors.danger, fontSize: Typography.sm, fontWeight: Typography.semibold },
  successBox: {
    backgroundColor: '#E8F8EF', borderRadius: Radius.sm, padding: Spacing.md,
    marginBottom: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.success,
  },
  successText: { color: Colors.success, fontSize: Typography.sm, fontWeight: Typography.semibold },
  fieldGroup: { marginBottom: Spacing.md },
  fieldLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.text, marginBottom: Spacing.xs },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    padding: Spacing.md, fontSize: Typography.base, color: Colors.text,
    backgroundColor: '#fff', ...Shadows.xs,
  },
  disabledInput: { backgroundColor: Colors.bg, color: Colors.textMuted },
});

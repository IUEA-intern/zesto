/**
 * screens/RegisterScreen.js — Zesto Customer
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { ZestoBrand, Button } from '../components';
import { useAuth } from '../services/AuthContext';
import { isValidEmail, isValidUgPhone } from '../utils';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister() {
    setError('');
    if (!name.trim()) { setError('Full name is required.'); return; }
    if (!isValidEmail(email)) { setError('Enter a valid email address.'); return; }
    if (phone.trim() && !isValidUgPhone(phone)) { setError('Enter a valid phone number (e.g. 0712345678).'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPass) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await register({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password });
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ZestoBrand size="lg" light />
            <Text style={styles.headerSub}>Create your account</Text>
          </View>

          <View style={styles.form}>
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️  {error}</Text>
              </View>
            )}

            <Field label="Full Name" value={name} onChangeText={setName} placeholder="Jane Doe" />
            <Field label="Email Address" value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
            <Field label="Phone Number (optional)" value={phone} onChangeText={setPhone}
              keyboardType="phone-pad" placeholder="07XXXXXXXX" />
            <Field label="Password (min 6 chars)" value={password} onChangeText={setPassword}
              secureTextEntry placeholder="Create a password" />
            <Field label="Confirm Password" value={confirmPass} onChangeText={setConfirmPass}
              secureTextEntry placeholder="Repeat your password" onSubmitEditing={handleRegister} />

            <Button title="Create Account" onPress={handleRegister} loading={loading} size="lg"
              style={styles.submitBtn} icon="🎉" />

            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: Spacing.lg }}>
              <Text style={styles.hint}>
                Already have an account? <Text style={{ color: Colors.orange, fontWeight: '700' }}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Field = React.forwardRef(function Field({ label, style, ...props }, ref) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput ref={ref} style={[styles.input, style]} placeholderTextColor={Colors.textMuted} {...props} />
    </View>
  );
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.dark },
  scroll: { flexGrow: 1 },
  header: { alignItems: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.sm },
  headerSub: { color: Colors.textOnDarkSec, fontSize: Typography.sm, letterSpacing: 0.5 },
  form: {
    flex: 1, backgroundColor: Colors.bg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingTop: Spacing.xxl,
  },
  errorBox: {
    backgroundColor: Colors.dangerBg, borderRadius: Radius.sm, padding: Spacing.md,
    marginBottom: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.danger,
  },
  errorText: { color: Colors.danger, fontSize: Typography.sm, fontWeight: Typography.semibold },
  fieldGroup: { marginBottom: Spacing.md },
  fieldLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.text, marginBottom: Spacing.xs },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    padding: Spacing.md, fontSize: Typography.base, color: Colors.text,
    backgroundColor: Colors.surface, ...Shadows.xs,
  },
  submitBtn: { marginTop: Spacing.sm },
  hint: { color: Colors.textSec, fontSize: Typography.sm, textAlign: 'center', lineHeight: 20 },
});

/**
 * screens/LoginScreen.js — Zesto Customer
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { ZestoBrand, Button } from '../components';
import { useAuth } from '../services/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passRef = useRef(null);

  async function handleLogin() {
    setError('');
    const e = email.trim().toLowerCase();
    if (!e) { setError('Email is required.'); return; }
    if (!password) { setError('Password is required.'); return; }
    setLoading(true);
    try {
      await login(e, password);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ZestoBrand size="xl" light />
            <Text style={styles.headerSub}>Food delivery, fast.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Welcome back</Text>
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️  {error}</Text>
              </View>
            )}

            <Field label="Email Address" value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com"
              returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} />

            <Field label="Password" value={password} onChangeText={setPassword}
              secureTextEntry placeholder="Your password" returnKeyType="done"
              onSubmitEditing={handleLogin} ref={passRef} />

            <Button title="Sign In" onPress={handleLogin} loading={loading} size="lg"
              style={styles.submitBtn} icon="🔑" />

            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: Spacing.lg }}>
              <Text style={styles.hint}>
                Don't have an account? <Text style={{ color: Colors.orange, fontWeight: '700' }}>Sign Up</Text>
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
  header: { alignItems: 'center', paddingTop: Spacing.xxl, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  headerSub: { color: Colors.textOnDarkSec, fontSize: Typography.sm, letterSpacing: 0.5 },
  form: {
    flex: 1, backgroundColor: Colors.bg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingTop: Spacing.xxl,
  },
  title: { fontSize: Typography.xxl, fontWeight: Typography.extrabold, color: Colors.text, marginBottom: Spacing.lg },
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

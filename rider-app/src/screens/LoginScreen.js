/**
 * screens/LoginScreen.js — Zesto Rider
 * Login + Sign Up tabs in one polished screen.
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { ZestoBrand, RiderChip, Button, Toast } from '../components';
import { useAuth } from '../services/AuthContext';
import { useSettings } from '../services/SettingsContext';

export default function LoginScreen({ navigation }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'

  return (
    <SafeAreaView style={styles.safe}>
      {/* Dark header */}
      <View style={styles.header}>
        <ZestoBrand size="xl" light />
        <RiderChip />
        <Text style={styles.headerSub}>Delivery Partner Portal</Text>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'login' && styles.tabActive]}
          onPress={() => setTab('login')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'register' && styles.tabActive]}
          onPress={() => setTab('register')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>Sign Up</Text>
        </TouchableOpacity>
      </View>

      {tab === 'login'
        ? <LoginForm />
        : <RegisterFlow />
      }
    </SafeAreaView>
  );
}

// ── Login Form ────────────────────────────────────────────────────
function LoginForm() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [toast,    setToast]    = useState({ visible: false, message: '', type: 'error' });
  const passRef = useRef(null);

  async function handleLogin() {
    setError('');
    const e = email.trim().toLowerCase();
    if (!e)        { setError('Email is required.'); return; }
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast(p=>({...p,visible:false}))} />

        {!!error && <ErrorBox message={error} />}

        <Field label="Email Address" value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com"
          returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} />

        <Field label="Password" value={password} onChangeText={setPassword}
          secureTextEntry placeholder="Your password" returnKeyType="done"
          onSubmitEditing={handleLogin} ref={passRef} />

        <Button title="Sign In" onPress={handleLogin} loading={loading} size="lg"
          style={styles.submitBtn} icon="🔑" />

        <Text style={styles.hint}>
          Don't have an account? Tap <Text style={{ color: Colors.orange, fontWeight: '700' }}>Sign Up</Text> above to register as a rider.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Registration Flow (3 steps) ───────────────────────────────────
function RegisterFlow() {
  const { loginWithToken } = useAuth();
  const [step, setStep] = useState(1); // 1=details, 2=verify OTP, 3=success
  const [pending, setPending] = useState(null); // email saved between steps
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });

  const showToast = (message, type = 'info') => setToast({ visible: true, message, type });

  if (step === 1) return (
    <RegisterStep1
      toast={toast} onHide={() => setToast(p=>({...p,visible:false}))}
      onNext={(email) => { setPending(email); setStep(2); }}
      showToast={showToast}
    />
  );
  if (step === 2) return (
    <RegisterStep2
      email={pending}
      toast={toast} onHide={() => setToast(p=>({...p,visible:false}))}
      onBack={() => setStep(1)}
      onSuccess={async (token, user) => {
        setStep(3);
        await loginWithToken(token, user);
      }}
      showToast={showToast}
    />
  );
  return <RegisterStep3 />;
}

// Step 1 — Personal & vehicle details
function RegisterStep1({ onNext, showToast, toast, onHide }) {
  const [name,          setName]          = useState('');
  const [email,         setEmail]         = useState('');
  const [phone,         setPhone]         = useState('');
  const [password,      setPassword]      = useState('');
  const [confirmPass,   setConfirmPass]   = useState('');
  const [vehicleType,   setVehicleType]   = useState('boda_boda');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [nationalId,    setNationalId]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const { AuthApi: _, ...__ } = {};

  const { AuthApi: AuthApiImport } = require('../services/api');

  async function handleNext() {
    setError('');
    if (!name.trim())         { setError('Full name is required.'); return; }
    if (!email.trim())        { setError('Email is required.'); return; }
    if (!phone.trim())        { setError('Phone number is required.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPass) { setError('Passwords do not match.'); return; }
    if (!vehicleNumber.trim()) { setError('Vehicle number is required.'); return; }
    if (!nationalId.trim())    { setError('National ID is required.'); return; }

    setLoading(true);
    try {
      const res = await AuthApiImport.sendOtp({
        name: name.trim(), email: email.trim().toLowerCase(),
        phone: phone.trim(), password,
        vehicleType, vehicleNumber: vehicleNumber.trim(), nationalId: nationalId.trim(),
      });
      if (res.success) {
        showToast(res.message, 'success');
        onNext(email.trim().toLowerCase());
      } else {
        setError(res.message || 'Failed to send verification code.');
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const vehicles = [
    { key: 'boda_boda', label: '🏍️  Boda Boda' },
    { key: 'bicycle',   label: '🚲  Bicycle' },
    { key: 'car',       label: '🚗  Car' },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={onHide} />
        <Text style={styles.stepTitle}>Step 1 of 2 — Your Details</Text>
        {!!error && <ErrorBox message={error} />}

        <Field label="Full Name" value={name} onChangeText={setName} placeholder="John Doe" />
        <Field label="Email Address" value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
        <Field label="Phone Number" value={phone} onChangeText={setPhone}
          keyboardType="phone-pad" placeholder="07XXXXXXXX" />
        <Field label="Password (min 8 chars)" value={password} onChangeText={setPassword}
          secureTextEntry placeholder="Create a strong password" />
        <Field label="Confirm Password" value={confirmPass} onChangeText={setConfirmPass}
          secureTextEntry placeholder="Repeat your password" />

        <Text style={styles.fieldLabel}>Vehicle Type</Text>
        <View style={styles.vehicleRow}>
          {vehicles.map(v => (
            <TouchableOpacity
              key={v.key}
              style={[styles.vehicleBtn, vehicleType === v.key && styles.vehicleBtnActive]}
              onPress={() => setVehicleType(v.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.vehicleBtnText, vehicleType === v.key && { color: Colors.orange }]}>
                {v.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field label="Vehicle Number / Plate" value={vehicleNumber} onChangeText={setVehicleNumber}
          autoCapitalize="characters" placeholder="UAA 000A" />
        <Field label="National ID Number" value={nationalId} onChangeText={setNationalId}
          placeholder="CM123456789..." />

        <Button title="Continue — Verify Email" onPress={handleNext} loading={loading}
          size="lg" style={styles.submitBtn} icon="📧" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Step 2 — OTP Verification
function RegisterStep2({ email, onBack, onSuccess, showToast, toast, onHide }) {
  const [otp,     setOtp]     = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error,   setError]   = useState('');
  const { AuthApi: AuthApiImport } = require('../services/api');

  async function handleVerify() {
    setError('');
    if (!/^\d{6}$/.test(otp.trim())) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    try {
      const res = await AuthApiImport.register(email, otp.trim());
      if (res.success) {
        onSuccess(res.token, res.user);
      } else {
        setError(res.message || 'Verification failed.');
      }
    } catch (err) {
      setError(err.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      showToast('A new code has been sent to your email.', 'info');
    } catch {}
    finally { setResending(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.formScroll, { alignItems: 'center' }]} keyboardShouldPersistTaps="handled">
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={onHide} />
        <Text style={styles.stepTitle}>Step 2 of 2 — Verify Email</Text>
        <Text style={styles.otpHint}>
          We sent a 6-digit code to{'\n'}
          <Text style={{ fontWeight: '700', color: Colors.text }}>{email}</Text>
        </Text>

        {!!error && <ErrorBox message={error} style={{ width: '100%' }} />}

        <TextInput
          style={styles.otpInput}
          value={otp}
          onChangeText={t => { setOtp(t.replace(/\D/g,'').slice(0,6)); setError(''); }}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          placeholderTextColor={Colors.textMuted}
          textAlign="center"
          autoFocus
        />

        <Button title="Verify & Complete Registration" onPress={handleVerify}
          loading={loading} disabled={otp.length !== 6} size="lg"
          style={[styles.submitBtn, { width: '100%' }]} icon="✅" />

        <TouchableOpacity onPress={onBack} style={{ marginTop: Spacing.md }}>
          <Text style={styles.linkText}>← Go back and edit details</Text>
        </TouchableOpacity>

        <Text style={[styles.hint, { marginTop: Spacing.lg }]}>
          💡 If you don't see the email, check your spam folder.{'\n'}
          In development mode the code is printed in the server console.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Step 3 — Success / Pending approval
function RegisterStep3() {
  const { settings } = useSettings();
  return (
    <ScrollView contentContainerStyle={[styles.formScroll, styles.successContainer]}>
      <Text style={styles.successEmoji}>🎉</Text>
      <Text style={styles.successTitle}>Registration Complete!</Text>
      <Text style={styles.successSub}>
        Your Zesto Rider account has been created successfully.
      </Text>

      <View style={styles.pendingBox}>
        <Text style={styles.pendingTitle}>⏳  Account Pending Approval</Text>
        <Text style={styles.pendingText}>
          Before you can start receiving deliveries, your account needs to be reviewed and approved by the Zesto team.
        </Text>
        <View style={styles.contactList}>
          <Text style={styles.contactItem}>📞  WhatsApp / Call: {settings.support_phone}</Text>
          <Text style={styles.contactItem}>✉️  Email: {settings.support_email}</Text>
          <Text style={styles.contactItem}>🏢  Visit our offices in Kampala</Text>
        </View>
        <Text style={styles.pendingNote}>
          Please reach out to get verified quickly. Approvals are typically completed within 24–48 hours.
        </Text>
      </View>

      <Text style={styles.hint}>
        You can now sign in with your credentials. Once approved, you'll be able to go online and accept deliveries.
      </Text>
    </ScrollView>
  );
}

// ── Shared form field ─────────────────────────────────────────────
const Field = React.forwardRef(function Field({ label, style, ...props }, ref) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        ref={ref}
        style={[styles.input, style]}
        placeholderTextColor={Colors.textMuted}
        {...props}
      />
    </View>
  );
});

function ErrorBox({ message, style }) {
  return (
    <View style={[styles.errorBox, style]}>
      <Text style={styles.errorText}>⚠️  {message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.dark },

  header: {
    alignItems: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.lg, gap: Spacing.sm,
    backgroundColor: Colors.dark,
  },
  headerSub: { color: Colors.textOnDarkSec, fontSize: Typography.sm, letterSpacing: 0.5 },

  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.dark,
    paddingHorizontal: Spacing.base, paddingBottom: 0,
  },
  tab: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.orange },
  tabText: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textOnDarkSec },
  tabTextActive: { color: Colors.orange, fontWeight: Typography.extrabold },

  formScroll: {
    padding: Spacing.base, paddingBottom: Spacing.xxxl,
    backgroundColor: Colors.bg, flexGrow: 1,
  },

  stepTitle: {
    fontSize: Typography.base, fontWeight: Typography.bold,
    color: Colors.textSec, marginBottom: Spacing.md, marginTop: Spacing.xs,
  },

  errorBox: {
    backgroundColor: Colors.dangerBg, borderRadius: Radius.sm,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
  },
  errorText: { color: Colors.danger, fontSize: Typography.sm, fontWeight: Typography.semibold },

  fieldGroup: { marginBottom: Spacing.md },
  fieldLabel: {
    fontSize: Typography.sm, fontWeight: Typography.bold,
    color: Colors.text, marginBottom: Spacing.xs,
  },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    padding: Spacing.md, fontSize: Typography.base, color: Colors.text,
    backgroundColor: Colors.surface, ...Shadows.xs,
  },

  vehicleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  vehicleBtn: {
    flex: 1, minWidth: 90, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface, alignItems: 'center',
  },
  vehicleBtnActive: { borderColor: Colors.orange, backgroundColor: Colors.orangePale },
  vehicleBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSec },

  submitBtn: { marginTop: Spacing.md },

  hint: { color: Colors.textSec, fontSize: Typography.sm, textAlign: 'center', marginTop: Spacing.lg, lineHeight: 20 },
  linkText: { color: Colors.orange, fontSize: Typography.sm, fontWeight: Typography.semibold },

  otpHint: { color: Colors.textSec, fontSize: Typography.sm, textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 21 },
  otpInput: {
    width: 220, height: 80, borderWidth: 3, borderColor: Colors.border,
    borderRadius: Radius.md, fontSize: 42, fontWeight: Typography.extrabold,
    color: Colors.text, backgroundColor: Colors.surface, textAlign: 'center',
    letterSpacing: 14, marginVertical: Spacing.xl, ...Shadows.md,
  },

  successContainer: { alignItems: 'center', paddingTop: Spacing.xl },
  successEmoji: { fontSize: 72, marginBottom: Spacing.md },
  successTitle: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: Colors.text, marginBottom: Spacing.sm },
  successSub: { fontSize: Typography.base, color: Colors.textSec, textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 22 },

  pendingBox: {
    backgroundColor: Colors.warningBg, borderRadius: Radius.md, padding: Spacing.base,
    borderLeftWidth: 4, borderLeftColor: Colors.warning, width: '100%', marginBottom: Spacing.lg,
  },
  pendingTitle: { fontSize: Typography.base, fontWeight: Typography.extrabold, color: Colors.warning, marginBottom: Spacing.sm },
  pendingText: { fontSize: Typography.sm, color: Colors.text, lineHeight: 21, marginBottom: Spacing.md },
  contactList: { gap: Spacing.xs, marginBottom: Spacing.md },
  contactItem: { fontSize: Typography.sm, color: Colors.text, fontWeight: Typography.medium },
  pendingNote: { fontSize: Typography.xs, color: Colors.textSec, fontStyle: 'italic', lineHeight: 18 },
});

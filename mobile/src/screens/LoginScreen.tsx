import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors } from '../theme';
import { useAuth } from '../auth';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function LoginScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError('Bitte alle Felder ausfüllen'); return; }
    setError('');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e: any) {
      setError(e.message || 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <Text style={s.emoji}>👋</Text>
        <Text style={s.title}>Willkommen zurück!</Text>
        <Text style={s.subtitle}>Melde dich an, um weiterzulernen</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TextInput
          style={s.input}
          placeholder="E-Mail"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={s.input}
          placeholder="Passwort"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnText}>Anmelden</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={s.link}>Noch kein Konto? <Text style={s.linkBold}>Registrieren</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: colors.cardBorder },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '900', color: colors.white, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 24 },
  error: { color: colors.error, fontSize: 13, textAlign: 'center', marginBottom: 12, fontWeight: '700' },
  input: {
    backgroundColor: colors.inputBg, borderRadius: 12, padding: 14, fontSize: 16,
    color: colors.white, borderWidth: 1, borderColor: colors.inputBorder, marginBottom: 12,
  },
  btn: {
    backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: 'center',
    marginTop: 8, marginBottom: 16,
  },
  btnText: { color: colors.bg, fontSize: 16, fontWeight: '900' },
  link: { color: colors.textMuted, textAlign: 'center', fontSize: 14 },
  linkBold: { color: colors.accent, fontWeight: '700' },
});

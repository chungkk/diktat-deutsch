import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors } from '../theme';
import { useAuth } from '../auth';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export default function RegisterScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!username || !email || !password) { setError('Bitte alle Felder ausfüllen'); return; }
    if (password.length < 6) { setError('Passwort: mindestens 6 Zeichen'); return; }
    setError('');
    setLoading(true);
    try {
      await register(username.trim(), email.trim().toLowerCase(), password);
    } catch (e: any) {
      setError(e.message || 'Registrierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <Text style={s.emoji}>🚀</Text>
        <Text style={s.title}>Konto erstellen</Text>
        <Text style={s.subtitle}>Starte deine Deutsch-Lernreise</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TextInput
          style={s.input}
          placeholder="Benutzername"
          placeholderTextColor={colors.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
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
          placeholder="Passwort (min. 6 Zeichen)"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnText}>Registrieren</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.link}>Bereits ein Konto? <Text style={s.linkBold}>Anmelden</Text></Text>
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

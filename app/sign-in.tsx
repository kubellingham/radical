import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

import { Screen } from '@/components/screen';
import { colors, space, type } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [mode, setMode] = useState<'sign-in' | 'create'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function submit() {
    if (!supabase || busy || !email || !password) return;
    setBusy(true);
    setNote(null);
    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setNote(error.message);
      return;
    }
    if (data.session) {
      router.replace('/');
    } else {
      // Email confirmation is on: the account exists, the session doesn't yet.
      setNote('Account created. Confirm the email, then sign in.');
      setMode('sign-in');
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}>
        <Text style={styles.mark}>語</Text>
        <Text style={styles.title}>Mission Control</Text>
        <Text style={styles.sub}>One account. Phone and web, same log.</Text>

        <TextInput
          style={styles.input}
          placeholder="email"
          placeholderTextColor={colors.slate}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="password"
          placeholderTextColor={colors.slate}
          secureTextEntry
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />

        {note ? <Text style={styles.note}>{note}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          disabled={busy}
          onPress={submit}>
          <Text style={styles.buttonText}>
            {busy ? '…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Text>
        </Pressable>

        <Pressable onPress={() => setMode(mode === 'sign-in' ? 'create' : 'sign-in')}>
          <Text style={styles.switch}>
            {mode === 'sign-in' ? 'First run? Create the account.' : 'Have the account? Sign in.'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'center',
  },
  mark: {
    color: colors.paper,
    fontSize: 64,
    marginBottom: space.md,
  },
  title: {
    color: colors.paper,
    fontSize: type.title,
    fontWeight: '600',
  },
  sub: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: space.xs,
    marginBottom: space.xl,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 6,
    color: colors.paper,
    fontSize: type.body,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    marginBottom: space.md,
  },
  note: {
    color: colors.slate,
    fontSize: type.small,
    marginBottom: space.md,
  },
  button: {
    backgroundColor: colors.paper,
    borderRadius: 6,
    paddingVertical: space.md - 2,
    alignItems: 'center',
    marginTop: space.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '600',
  },
  switch: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: space.lg,
    textAlign: 'center',
  },
});

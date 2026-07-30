import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/screen';
import { colors, space, type } from '@/constants/theme';
import { supabaseConfigured, useApp } from '@/lib/app-state';
import { parseDump } from '@/lib/dump';
import { DEFAULT_LANGUAGES } from '@/lib/languages';
import { saveDump } from '@/lib/repo';
import type { ContextTag, DraftItem } from '@/lib/types';

const CONTEXTS: ContextTag[] = ['café', 'class', 'transit', 'gym', 'home', 'street'];

const EMPTY_DRAFT: Omit<DraftItem, 'languageCode'> = {
  term: '',
  reading: '',
  meaning: '',
  example: '',
  exampleMeaning: '',
  contextTag: '',
  sinoRoot: '',
};

export default function Found() {
  const insets = useSafeAreaInsets();
  const { setup } = useApp();
  // Script gate: vocabulary only for languages whose script is learned.
  const languages = setup.languages.length > 0 ? setup.languages : DEFAULT_LANGUAGES;
  const unlocked = languages.filter((l) => l.scriptLearned);
  const unlockedCodes = new Set(unlocked.map((l) => l.code));
  const [phase, setPhase] = useState<'compose' | 'confirm'>('compose');
  const [text, setText] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  async function parse() {
    if (busy || text.trim().length === 0) return;
    setBusy(true);
    setLine(null);
    try {
      const result = await parseDump(text.trim());
      setDrafts(
        result.items.length > 0
          ? result.items
          : [{ ...EMPTY_DRAFT, languageCode: unlocked[0]?.code ?? 'es', term: text.trim() }]
      );
      if (!result.remote) setLine('Parsed locally — the AI parser was unreachable.');
      setPhase('confirm');
    } finally {
      setBusy(false);
    }
  }

  const fileable = drafts.filter(
    (d) => d.term.trim().length > 0 && unlockedCodes.has(d.languageCode)
  );

  async function save() {
    if (busy || fileable.length === 0) return;
    setBusy(true);
    try {
      const { itemCount, synced } = await saveDump({
        drafts: fileable,
        minutes: Math.max(0, parseInt(minutes, 10) || 0),
        note: note.trim(),
      });
      setText('');
      setMinutes('');
      setNote('');
      setDrafts([]);
      setPhase('compose');
      setLine(
        synced || !supabaseConfigured
          ? `Filed. ${itemCount} ${itemCount === 1 ? 'item' : 'items'}.`
          : `Filed locally. ${itemCount} ${itemCount === 1 ? 'item' : 'items'} — syncs when reachable.`
      );
    } catch {
      setLine('Could not file — nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  function patch(index: number, changes: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...changes } : d)));
  }

  return (
    <Screen title="Found">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
        style={styles.fill}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}>
          {line ? <Text style={styles.line}>{line}</Text> : null}

          {phase === 'compose' ? (
            <>
              <TextInput
                style={styles.big}
                multiline
                placeholder="learned 시간 means time, and 준비 = preparation"
                placeholderTextColor={colors.slate}
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  if (line) setLine(null);
                }}
              />
              <View style={styles.metaRow}>
                <TextInput
                  style={[styles.input, styles.minutes]}
                  placeholder="min"
                  placeholderTextColor={colors.slate}
                  keyboardType="number-pad"
                  value={minutes}
                  onChangeText={setMinutes}
                />
                <TextInput
                  style={[styles.input, styles.note]}
                  placeholder="one line about today"
                  placeholderTextColor={colors.slate}
                  value={note}
                  onChangeText={setNote}
                />
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.action,
                  text.trim().length === 0 && styles.actionDisabled,
                  pressed && styles.pressed,
                ]}
                disabled={busy || text.trim().length === 0}
                onPress={parse}>
                <Text style={styles.actionText}>{busy ? '…' : 'Parse'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              {drafts.map((draft, i) => (
                <View key={i} style={styles.card}>
                  <View style={styles.chipRow}>
                    {unlocked.map((lang) => {
                      const active = draft.languageCode === lang.code;
                      return (
                        <Pressable
                          key={lang.code}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => patch(i, { languageCode: lang.code })}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {lang.glyph}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <View style={styles.spacer} />
                    <Pressable
                      onPress={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}>
                      <Text style={styles.remove}>remove</Text>
                    </Pressable>
                  </View>
                  {!unlockedCodes.has(draft.languageCode) ? (
                    <Text style={styles.locked}>
                      {languages.find((l) => l.code === draft.languageCode)?.name ?? 'This language'}{' '}
                      is in script mode — learn its script first, or reassign the item.
                    </Text>
                  ) : null}
                  <Field label="term" value={draft.term} onChange={(v) => patch(i, { term: v })} />
                  <Field
                    label="reading"
                    value={draft.reading}
                    onChange={(v) => patch(i, { reading: v })}
                  />
                  <Field
                    label="meaning"
                    value={draft.meaning}
                    onChange={(v) => patch(i, { meaning: v })}
                  />
                  <Field
                    label="example"
                    value={draft.example}
                    onChange={(v) => patch(i, { example: v })}
                  />
                  {['ja', 'ko', 'zh'].includes(draft.languageCode) ? (
                    <Field
                      label="sino root"
                      value={draft.sinoRoot}
                      onChange={(v) => patch(i, { sinoRoot: v })}
                    />
                  ) : null}
                  <View style={styles.chipRow}>
                    {CONTEXTS.map((ctx) => {
                      const active = draft.contextTag === ctx;
                      return (
                        <Pressable
                          key={ctx}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => patch(i, { contextTag: active ? '' : ctx })}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {ctx}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}

              <Pressable
                onPress={() =>
                  setDrafts((prev) => [
                    ...prev,
                    { ...EMPTY_DRAFT, languageCode: unlocked[0]?.code ?? 'es' },
                  ])
                }>
                <Text style={styles.add}>+ add item</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.action,
                  fileable.length === 0 && styles.actionDisabled,
                  pressed && styles.pressed,
                ]}
                disabled={busy || fileable.length === 0}
                onPress={save}>
                <Text style={styles.actionText}>
                  {busy
                    ? '…'
                    : `File ${fileable.length} ${fileable.length === 1 ? 'item' : 'items'}`}
                </Text>
              </Pressable>
              <Pressable onPress={() => setPhase('compose')}>
                <Text style={styles.back}>Back to the text</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.slate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: space.xl },
  line: {
    color: colors.slate,
    fontSize: type.small,
    marginBottom: space.md,
  },
  big: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 8,
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.5,
    padding: space.md,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  metaRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 6,
    color: colors.paper,
    fontSize: type.small,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  minutes: { width: 72 },
  note: { flex: 1 },
  action: {
    backgroundColor: colors.paper,
    borderRadius: 6,
    paddingVertical: space.md - 2,
    alignItems: 'center',
    marginTop: space.md,
  },
  actionDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  actionText: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 8,
    padding: space.md,
    marginBottom: space.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  spacer: { flex: 1 },
  chip: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 2,
  },
  chipActive: {
    backgroundColor: colors.paper,
    borderColor: colors.paper,
  },
  chipText: {
    color: colors.slate,
    fontSize: type.small,
  },
  chipTextActive: {
    color: colors.ink,
    fontWeight: '600',
  },
  remove: {
    color: colors.slate,
    fontSize: type.micro,
  },
  locked: {
    color: colors.slate,
    fontSize: type.small,
    marginBottom: space.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xs + 2,
  },
  fieldLabel: {
    color: colors.slate,
    fontSize: type.micro,
    width: 72,
  },
  fieldInput: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
    color: colors.paper,
    fontSize: type.body,
    paddingVertical: 4,
  },
  add: {
    color: colors.slate,
    fontSize: type.small,
    marginBottom: space.sm,
  },
  back: {
    color: colors.slate,
    fontSize: type.small,
    textAlign: 'center',
    marginTop: space.md,
  },
});

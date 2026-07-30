import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Toggle } from '@/components/toggle';
import { colors, space, type } from '@/constants/theme';
import { useApp } from '@/lib/app-state';
import { DEFAULT_LANGUAGES } from '@/lib/languages';
import { saveSetup } from '@/lib/setup';
import type { LanguageConfig, RhythmSlot } from '@/lib/types';

const SLOTS: RhythmSlot[] = ['morning', 'afternoon', 'evening', 'any'];

export default function Setup() {
  const { setup, completeSetup } = useApp();
  const [languages, setLanguages] = useState<LanguageConfig[]>(
    setup.languages.length > 0 ? setup.languages : DEFAULT_LANGUAGES
  );
  const [busy, setBusy] = useState(false);

  function patch(code: string, changes: Partial<LanguageConfig>) {
    setLanguages((prev) =>
      prev.map((l) => {
        if (l.code !== code) return l;
        const next = { ...l, ...changes };
        // Script gate: no vocabulary in a script you can't read.
        if ('scriptLearned' in changes) {
          next.status = next.scriptLearned ? 'active' : 'script';
        }
        return next;
      })
    );
  }

  async function begin() {
    if (busy) return;
    setBusy(true);
    try {
      const { state, synced } = await saveSetup(languages);
      completeSetup(state, synced);
      router.replace('/today');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Five languages. Five years." edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Mark each script you can already read. A language stays in script mode — cards and packs
          locked to its writing system — until you mark its script learned.
        </Text>

        {languages.map((lang) => (
          <View key={lang.code} style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.glyph}>{lang.glyph}</Text>
              <View style={styles.headText}>
                <Text style={styles.name}>{lang.name}</Text>
                <Text style={styles.script}>
                  {lang.script} · {lang.scriptLearned ? 'active' : 'script mode'}
                </Text>
              </View>
              <Toggle
                value={lang.scriptLearned}
                onValueChange={(v) => patch(lang.code, { scriptLearned: v })}
              />
            </View>
            <View style={styles.slots}>
              {SLOTS.map((slot) => {
                const active = lang.rhythmSlot === slot;
                return (
                  <Pressable
                    key={slot}
                    style={[styles.slot, active && styles.slotActive]}
                    onPress={() => patch(lang.code, { rhythmSlot: slot })}>
                    <Text style={[styles.slotText, active && styles.slotTextActive]}>{slot}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [styles.begin, pressed && styles.pressed]}
          disabled={busy}
          onPress={begin}>
          <Text style={styles.beginText}>{busy ? '…' : 'Begin'}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: space.xl,
  },
  intro: {
    color: colors.slate,
    fontSize: type.small,
    lineHeight: type.small * 1.6,
    marginBottom: space.lg,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 8,
    padding: space.md,
    marginBottom: space.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  glyph: {
    color: colors.paper,
    fontSize: type.glyph,
    width: 48,
  },
  headText: {
    flex: 1,
  },
  name: {
    color: colors.paper,
    fontSize: type.body,
    fontWeight: '600',
  },
  script: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: 2,
  },
  slots: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  slot: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: space.md - 2,
    paddingVertical: space.xs + 2,
  },
  slotActive: {
    backgroundColor: colors.paper,
    borderColor: colors.paper,
  },
  slotText: {
    color: colors.slate,
    fontSize: type.small,
  },
  slotTextActive: {
    color: colors.ink,
    fontWeight: '600',
  },
  begin: {
    backgroundColor: colors.paper,
    borderRadius: 6,
    paddingVertical: space.md - 2,
    alignItems: 'center',
    marginTop: space.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  beginText: {
    color: colors.ink,
    fontSize: type.body,
    fontWeight: '600',
  },
});

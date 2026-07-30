import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { colors, space, type } from '@/constants/theme';
import { supabaseConfigured, useApp } from '@/lib/app-state';
import { checkedToday } from '@/lib/check';
import { type Drift, driftLine, drifting } from '@/lib/drift';
import { DEFAULT_LANGUAGES } from '@/lib/languages';
import { dueSets, refillIfLow, sentenceOfTheDay } from '@/lib/sets';
import type { LexemeSet } from '@/lib/types';

const ORDER = DEFAULT_LANGUAGES.map((l) => l.code);
const MINUTES_PER_CARD = 0.7;

export default function Today() {
  const { pendingSync, setup } = useApp();
  const [sentence, setSentence] = useState<LexemeSet | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [drift, setDrift] = useState<Drift | null>(null);
  const [checked, setChecked] = useState(true);

  const languages = setup.languages;
  const build = useCallback(() => {
    let cancelled = false;
    Promise.all([sentenceOfTheDay(), dueSets('word', 'any')]).then(([s, words]) => {
      if (cancelled) return;
      setSentence(s);
      setWaiting(words.length);
      setLoaded(true);
    });
    Promise.all([drifting(languages), checkedToday()]).then(([d, done]) => {
      if (cancelled) return;
      setDrift(d);
      setChecked(done);
    });
    refillIfLow('word');
    refillIfLow('sentence');
    return () => {
      cancelled = true;
    };
  }, [languages]);

  useFocusEffect(build);

  const rows = sentence
    ? ORDER.map((code) => sentence.renderings.find((r) => r.languageCode === code)).filter(
        (r): r is NonNullable<typeof r> => r !== undefined
      )
    : [];

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Screen title="Today">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.date}>{today}</Text>

        {sentence ? (
          <>
            <Text style={styles.gloss}>{sentence.gloss}</Text>
            <View style={styles.sentence}>
              {rows.map((r) => {
                const lang = DEFAULT_LANGUAGES.find((l) => l.code === r.languageCode);
                return (
                  <View key={r.languageCode} style={styles.line}>
                    <Text style={styles.glyph}>{lang?.glyph}</Text>
                    <View style={styles.lineText}>
                      <Text style={styles.term}>{r.term}</Text>
                      {r.say ? <Text style={styles.say}>{r.say}</Text> : null}
                      {r.reading ? <Text style={styles.reading}>{r.reading}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : loaded ? (
          <Text style={styles.gloss}>Today&apos;s sentence is on its way.</Text>
        ) : null}

        {waiting > 0 ? (
          <View style={styles.missionRow}>
            <Text style={styles.missionLabel}>
              {waiting} {waiting === 1 ? 'card' : 'cards'} waiting in the Feed
            </Text>
            <Text style={styles.missionValue}>
              {Math.max(1, Math.round(waiting * MINUTES_PER_CARD))} min
            </Text>
          </View>
        ) : null}

        {/* The one drop of colour in the whole app, on the one language
            that has gone quiet. Never two at once. */}
        {drift ? (
          <Link href="/check" style={styles.drift}>
            {driftLine(drift)}
          </Link>
        ) : null}

        {!checked ? (
          <Link href="/check" style={styles.check}>
            Two minutes, not done today.
          </Link>
        ) : null}

        {pendingSync && supabaseConfigured ? (
          <Text style={styles.quiet}>Saved on this device. Syncs when signed in.</Text>
        ) : null}

        <Link href="/setup" style={styles.edit}>
          Languages and scripts
        </Link>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xl },
  date: {
    color: colors.slate,
    fontSize: type.small,
    marginBottom: space.lg,
  },
  gloss: {
    color: colors.slate,
    fontSize: type.small,
    marginBottom: space.md,
  },
  sentence: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  glyph: {
    color: colors.slate,
    fontSize: type.body,
    width: 32,
    marginTop: 2,
  },
  lineText: { flex: 1 },
  term: {
    color: colors.paper,
    fontSize: 21,
    lineHeight: 30,
  },
  say: {
    color: colors.paper,
    fontSize: type.small,
    opacity: 0.75,
    marginTop: 4,
  },
  reading: {
    color: colors.slate,
    fontSize: type.micro,
    marginTop: 2,
  },
  missionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.lg,
  },
  missionLabel: {
    color: colors.slate,
    fontSize: type.small,
  },
  missionValue: {
    color: colors.paper,
    fontSize: type.small,
  },
  drift: {
    color: colors.seal,
    fontSize: type.small,
    marginTop: space.lg,
  },
  check: {
    color: colors.paper,
    fontSize: type.small,
    marginTop: space.md,
  },
  quiet: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: space.lg,
  },
  edit: {
    color: colors.slate,
    fontSize: type.small,
    textDecorationLine: 'underline',
    marginTop: space.xl,
  },
});

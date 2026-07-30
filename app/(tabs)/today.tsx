import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { colors, space, type } from '@/constants/theme';
import { supabaseConfigured, useApp } from '@/lib/app-state';
import { missionCounts } from '@/lib/deck';
import { loadSessions, localDay } from '@/lib/repo';
import type { LanguageConfig, RhythmSlot } from '@/lib/types';

interface Mission {
  key: string;
  glyph: string;
  language: string;
  task: string;
  minutes: number;
}

// Rough, deliberately: the estimate exists to set expectations, not to be
// audited. A card is about forty seconds once you know the deck.
const MINUTES_PER_CARD = 0.7;
const SCRIPT_MINUTES = 12;
const CAPTURE_MINUTES = 3;

function slotNow(): RhythmSlot {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export default function Today() {
  const { setup, pendingSync } = useApp();
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [capturedToday, setCapturedToday] = useState(false);

  const build = useCallback(() => {
    let cancelled = false;
    const languages = setup.languages;
    const unlocked = languages.filter((l) => l.scriptLearned).map((l) => l.code);

    Promise.all([missionCounts(unlocked), loadSessions()]).then(([counts, sessions]) => {
      if (cancelled) return;
      const { perLanguage: due, shared } = counts;
      const today = localDay();
      const captured = sessions.some((s) => s.date === today && s.kind === 'dump');
      setCapturedToday(captured);

      const slot = slotNow();
      const ranked = [...languages].sort((a, b) => rank(a, slot) - rank(b, slot));

      const list: Mission[] = [];
      // One card, three languages — the shared roots earn their own line.
      if (shared > 0) {
        list.push({
          key: 'shared',
          glyph: '字',
          language: 'Shared roots',
          task: `Review ${shared} ${shared === 1 ? 'card' : 'cards'}`,
          minutes: Math.max(1, Math.round(shared * MINUTES_PER_CARD)),
        });
      }
      for (const lang of ranked) {
        if (list.length >= 3) break;
        if (!lang.scriptLearned) {
          list.push({
            key: lang.code,
            glyph: lang.glyph,
            language: lang.name,
            task: `Learn ${lang.script}`,
            minutes: SCRIPT_MINUTES,
          });
          continue;
        }
        const n = due.get(lang.code) ?? 0;
        if (n > 0) {
          list.push({
            key: lang.code,
            glyph: lang.glyph,
            language: lang.name,
            task: `Review ${n} ${n === 1 ? 'card' : 'cards'}`,
            minutes: Math.max(1, Math.round(n * MINUTES_PER_CARD)),
          });
        }
      }

      if (list.length === 0 && !captured) {
        const first = ranked[0];
        list.push({
          key: 'capture',
          glyph: first?.glyph ?? '·',
          language: first?.name ?? 'Anything',
          task: 'Capture something you learned',
          minutes: CAPTURE_MINUTES,
        });
      }
      setMissions(list);
    });

    return () => {
      cancelled = true;
    };
  }, [setup.languages]);

  useFocusEffect(build);

  const total = (missions ?? []).reduce((sum, m) => sum + m.minutes, 0);

  return (
    <Screen title="Today's Mission">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {missions === null ? null : missions.length === 0 ? (
          <Text style={styles.done}>
            {capturedToday
              ? 'Done for today. Anything else you pick up is a bonus.'
              : 'Nothing waiting. Capture what you learn out there and it turns up here.'}
          </Text>
        ) : (
          <>
            {missions.map((m) => (
              <View key={m.key} style={styles.row}>
                <Text style={styles.glyph}>{m.glyph}</Text>
                <View style={styles.rowText}>
                  <Text style={styles.language}>{m.language}</Text>
                  <Text style={styles.task}>{m.task}</Text>
                </View>
                <Text style={styles.minutes}>{m.minutes} min</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated time</Text>
              <Text style={styles.totalValue}>{total} minutes</Text>
            </View>
          </>
        )}

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

// Languages assigned to the current slot come first; script work outranks
// review, since a script you can't read blocks everything downstream.
function rank(lang: LanguageConfig, slot: RhythmSlot): number {
  const slotScore = lang.rhythmSlot === slot ? 0 : lang.rhythmSlot === 'any' ? 1 : 2;
  const stageScore = lang.scriptLearned ? 1 : 0;
  return slotScore * 10 + stageScore * 5 + lang.sortOrder * 0.1;
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  glyph: {
    color: colors.paper,
    fontSize: type.glyph,
    width: 56,
  },
  rowText: { flex: 1 },
  language: {
    color: colors.paper,
    fontSize: type.body,
    fontWeight: '600',
  },
  task: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: 2,
  },
  minutes: {
    color: colors.slate,
    fontSize: type.small,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.lg,
  },
  totalLabel: {
    color: colors.slate,
    fontSize: type.small,
  },
  totalValue: {
    color: colors.paper,
    fontSize: type.small,
  },
  done: {
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.6,
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

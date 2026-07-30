import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { colors, space, type } from '@/constants/theme';
import { useApp } from '@/lib/app-state';
import { DEFAULT_LANGUAGES, languageByCode } from '@/lib/languages';
import { loadSessions, localDay, logSession } from '@/lib/repo';
import type { LanguageCode, SessionEntry } from '@/lib/types';

const TOTAL_DAYS = 1825;

export default function Record() {
  const { setup } = useApp();
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [logging, setLogging] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [logLine, setLogLine] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let cancelled = false;
    loadSessions().then((log) => {
      if (!cancelled) setSessions(log);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(refresh);

  const stats = useMemo(() => {
    const totalMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
    const byLanguage = new Map<LanguageCode, number>();
    for (const s of sessions) {
      if (s.languageCode) {
        byLanguage.set(s.languageCode, (byLanguage.get(s.languageCode) ?? 0) + s.minutes);
      }
    }
    const month = localDay().slice(0, 7);
    const activeDays = new Set(sessions.filter((s) => s.date.startsWith(month)).map((s) => s.date))
      .size;
    return { totalMinutes, byLanguage, activeDays };
  }, [sessions]);

  const dayN = useMemo(() => {
    if (!setup.completedAt) return 1;
    const start = new Date(setup.completedAt);
    const days =
      Math.floor(
        (new Date(localDay()).getTime() - new Date(localDay(start)).getTime()) / 86400000
      ) + 1;
    return Math.max(1, days);
  }, [setup.completedAt]);

  async function submitLog() {
    const min = parseInt(minutes, 10) || 0;
    if (busy || min <= 0) return;
    setBusy(true);
    setLogLine(null);
    try {
      await logSession({ kind: 'external', minutes: min, note: note.trim(), languageCode: language });
      setMinutes('');
      setNote('');
      setLanguage(null);
      setLogging(false);
      refresh();
    } catch {
      setLogLine('Could not log — nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Record">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.hours}>{formatHours(stats.totalMinutes)}</Text>
        <Text style={styles.day}>
          Day {dayN} of {TOTAL_DAYS} · {stats.activeDays} {stats.activeDays === 1 ? 'day' : 'days'}{' '}
          active this month
        </Text>

        <View style={styles.langRow}>
          {DEFAULT_LANGUAGES.map((lang) => (
            <View key={lang.code} style={styles.langCell}>
              <Text style={styles.langGlyph}>{lang.glyph}</Text>
              <Text style={styles.langHours}>
                {formatHours(stats.byLanguage.get(lang.code) ?? 0)}
              </Text>
            </View>
          ))}
        </View>

        {logging ? (
          <View style={styles.logForm}>
            {logLine ? <Text style={styles.logError}>{logLine}</Text> : null}
            <View style={styles.logRow}>
              <TextInput
                style={[styles.input, styles.minutes]}
                placeholder="min"
                placeholderTextColor={colors.slate}
                keyboardType="number-pad"
                value={minutes}
                onChangeText={setMinutes}
              />
              {DEFAULT_LANGUAGES.map((lang) => {
                const active = language === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setLanguage(active ? null : lang.code)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {lang.glyph}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={styles.input}
              placeholder="what was it"
              placeholderTextColor={colors.slate}
              value={note}
              onChangeText={setNote}
              onSubmitEditing={submitLog}
            />
            <View style={styles.logRow}>
              <Pressable onPress={submitLog} disabled={busy}>
                <Text style={styles.logAction}>{busy ? '…' : 'Log it'}</Text>
              </Pressable>
              <Pressable onPress={() => setLogging(false)}>
                <Text style={styles.logCancel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setLogging(true)}>
            <Text style={styles.logToggle}>+ log time outside the app</Text>
          </Pressable>
        )}

        <Link href="/line" style={styles.lines}>
          The line, and every one before it
        </Link>

        <View style={styles.divider} />

        {sessions.length === 0 ? (
          <Text style={styles.empty}>
            Nothing logged yet. Put what you learn into Found, or log study time above — the hours
            count from here on.
          </Text>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={styles.entry}>
              <Text style={styles.entryMeta}>
                {formatDate(s.date)}
                {s.languageCode ? ` · ${languageByCode(s.languageCode)?.name}` : ''}
                {s.minutes > 0 ? ` · ${s.minutes} min` : ''}
                {s.kind !== 'dump' ? ` · ${s.kind}` : ''}
              </Text>
              {s.note ? <Text style={styles.entryNote}>{s.note}</Text> : null}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 100) return `${Math.round(hours)} h`;
  return `${(Math.round(hours * 10) / 10).toString()} h`;
}

function formatDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: y !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xl },
  hours: {
    color: colors.paper,
    fontSize: 56,
    fontWeight: '600',
    letterSpacing: -1,
  },
  day: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: space.xs,
  },
  langRow: {
    flexDirection: 'row',
    marginTop: space.lg,
  },
  langCell: {
    flex: 1,
    alignItems: 'flex-start',
  },
  langGlyph: {
    color: colors.paper,
    fontSize: type.title,
  },
  langHours: {
    color: colors.slate,
    fontSize: type.micro,
    marginTop: 2,
  },
  logToggle: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: space.lg,
  },
  logForm: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 8,
    padding: space.md,
    marginTop: space.lg,
    gap: space.sm,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
  logAction: {
    color: colors.paper,
    fontSize: type.small,
    fontWeight: '600',
  },
  logCancel: {
    color: colors.slate,
    fontSize: type.small,
  },
  logError: {
    color: colors.slate,
    fontSize: type.small,
  },
  lines: {
    color: colors.slate,
    fontSize: type.small,
    textDecorationLine: 'underline',
    marginTop: space.lg,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    marginVertical: space.lg,
  },
  empty: {
    color: colors.slate,
    fontSize: type.small,
    lineHeight: type.small * 1.6,
  },
  entry: {
    marginBottom: space.lg,
  },
  entryMeta: {
    color: colors.slate,
    fontSize: type.micro,
    marginBottom: 2,
  },
  entryNote: {
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.7,
  },
});

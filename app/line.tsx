import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';
import React, { useCallback, useState } from 'react';
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

import { Screen } from '@/components/screen';
import { colors, space, type } from '@/constants/theme';
import { useApp } from '@/lib/app-state';
import { languageByCode } from '@/lib/languages';
import { loadLines, lineFor, saveLine, suggestedLanguage, writableLanguages } from '@/lib/line';
import { localDay } from '@/lib/repo';
import { sentenceOfTheDay } from '@/lib/sets';
import type { DailyLine, LanguageCode, LexemeSet } from '@/lib/types';

// The blank line is the whole problem. Rather than invent a prompt, the box
// shows today's sentence in the language you are about to write in — the same
// sentence already sitting at the top of Today. It is real, it is the right
// size, and it changes daily, so it shows what is being asked for without
// asking anything. These are the fallback for a bank with no sentence in it.
const SHAPES: Record<LanguageCode, string> = {
  ja: '今日は雨だった',
  ko: '오늘 커피를 두 잔 마셨다',
  zh: '今天很冷',
  es: 'hoy no salí de casa',
  ru: 'сегодня было тихо',
};

export default function Line() {
  const { setup } = useApp();
  const [today, setToday] = useState<DailyLine | null>(null);
  const [past, setPast] = useState<DailyLine[]>([]);
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [seed, setSeed] = useState<LexemeSet | null>(null);

  const writable = writableLanguages(setup.languages);
  const day = localDay();

  const load = useCallback(() => {
    let cancelled = false;
    Promise.all([
      lineFor(day),
      loadLines(),
      suggestedLanguage(setup.languages),
      sentenceOfTheDay(),
    ]).then(([mine, all, suggested, sentence]) => {
      if (cancelled) return;
      setToday(mine);
      setPast(all.filter((l) => l.date !== day));
      setLanguage(mine?.languageCode ?? suggested);
      setText(mine?.text ?? '');
      setEditing(!mine);
      setSeed(sentence);
    });
    return () => {
      cancelled = true;
    };
  }, [day, setup.languages]);

  useFocusEffect(load);

  async function commit() {
    if (busy || !language) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setNote(null);
    try {
      const saved = await saveLine({ text: trimmed, languageCode: language, languages: setup.languages });
      if (!saved) {
        setNote('Could not write — nothing was saved.');
        return;
      }
      setToday(saved);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (writable.length === 0) {
    return (
      <Screen title="The line" edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.flat}>
          Scripts first. The line opens on a language once its script is marked learned.
        </Text>
        <Link href="/today" style={styles.back}>
          Back to Today
        </Link>
      </Screen>
    );
  }

  return (
    <Screen title="The line" edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {editing ? (
            <>
              <View style={styles.chips}>
                {writable.map((code) => {
                  const lang = languageByCode(code);
                  const active = language === code;
                  return (
                    <Pressable
                      key={code}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setLanguage(code)}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {lang?.glyph}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={styles.input}
                placeholder={language ? shapeFor(seed, language) : ''}
                placeholderTextColor={colors.slate}
                value={text}
                onChangeText={setText}
                multiline
                autoCorrect={false}
              />

              {note ? <Text style={styles.quiet}>{note}</Text> : null}

              <View style={styles.actions}>
                <Pressable onPress={commit} disabled={busy} hitSlop={12}>
                  <Text style={styles.commit}>{busy ? '…' : today ? 'Rewrite it' : 'Keep it'}</Text>
                </Pressable>
                {today ? (
                  <Pressable
                    onPress={() => {
                      setText(today.text);
                      setLanguage(today.languageCode);
                      setEditing(false);
                    }}
                    hitSlop={12}>
                    <Text style={styles.cancel}>Cancel</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : today ? (
            <Pressable onPress={() => setEditing(true)}>
              <Text style={styles.todayMeta}>
                Today · {languageByCode(today.languageCode)?.name}
              </Text>
              <Text style={styles.todayText}>{today.text}</Text>
            </Pressable>
          ) : null}

          <View style={styles.divider} />

          {past.length === 0 ? (
            <Text style={styles.quiet}>
              Nothing behind this one yet. A line a day, and this is where they stack up.
            </Text>
          ) : (
            past.map((line) => (
              <View key={line.date} style={styles.entry}>
                <Text style={styles.entryMeta}>
                  {formatDate(line.date)} · {languageByCode(line.languageCode)?.glyph}
                </Text>
                <Text style={styles.entryText}>{line.text}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Today's sentence in the language being written in, or a stand-in. */
function shapeFor(sentence: LexemeSet | null, code: LanguageCode): string {
  const rendering = sentence?.renderings.find((r) => r.languageCode === code);
  return rendering?.term || SHAPES[code];
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
  fill: { flex: 1 },
  scroll: { paddingBottom: space.xl },
  flat: {
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.6,
  },
  chips: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: space.md - 2,
    paddingVertical: space.xs,
  },
  chipActive: {
    backgroundColor: colors.paper,
    borderColor: colors.paper,
  },
  chipText: {
    color: colors.slate,
    fontSize: type.body,
  },
  chipTextActive: {
    color: colors.ink,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 6,
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.6,
    minHeight: 96,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginTop: space.md,
  },
  commit: {
    color: colors.paper,
    fontSize: type.body,
    fontWeight: '600',
  },
  cancel: {
    color: colors.slate,
    fontSize: type.small,
  },
  todayMeta: {
    color: colors.slate,
    fontSize: type.micro,
    marginBottom: space.xs,
  },
  todayText: {
    color: colors.paper,
    fontSize: 21,
    lineHeight: 30,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    marginVertical: space.lg,
  },
  quiet: {
    color: colors.slate,
    fontSize: type.small,
    lineHeight: type.small * 1.6,
    marginTop: space.sm,
  },
  entry: {
    marginBottom: space.lg,
  },
  entryMeta: {
    color: colors.slate,
    fontSize: type.micro,
    marginBottom: 2,
  },
  entryText: {
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.7,
  },
  back: {
    color: colors.slate,
    fontSize: type.small,
    textDecorationLine: 'underline',
    marginTop: space.xl,
  },
});

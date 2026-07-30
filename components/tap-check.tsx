import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '@/constants/theme';
import { TAP_COUNT } from '@/lib/check';
import { languageByCode } from '@/lib/languages';
import type { CheckTurn, CheckVerdict, LanguageCode, LexemeSet } from '@/lib/types';

/**
 * The Check with no network: ten questions, one language each, tapped
 * through. It grades exactly the same way the conversation does, so a week
 * of flights still keeps the drift signal honest.
 */
export function TapCheck({
  pool,
  languages,
  onDone,
}: {
  pool: LexemeSet[];
  languages: LanguageCode[];
  onDone: (result: { transcript: CheckTurn[]; verdicts: CheckVerdict[] }) => void;
}) {
  // One language each, cycling, so no language gets a free pass.
  const questions = useMemo(
    () =>
      pool
        .slice(0, TAP_COUNT)
        .map((set, i) => ({ set, code: languages[i % languages.length] })),
    [pool, languages]
  );

  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [transcript, setTranscript] = useState<CheckTurn[]>([]);
  const [verdicts, setVerdicts] = useState<CheckVerdict[]>([]);

  const question = questions[index];
  if (!question) return null;

  const lang = languageByCode(question.code);
  const rendering = question.set.renderings.find((r) => r.languageCode === question.code);

  function answer(had: boolean) {
    const nextTranscript: CheckTurn[] = [
      ...transcript,
      { role: 'app', text: `${lang?.name}: ${question.set.gloss}` },
      { role: 'you', text: had ? (rendering?.term ?? '') : '—' },
    ];
    const nextVerdicts: CheckVerdict[] = [
      ...verdicts,
      {
        setId: question.set.id,
        languageCode: question.code,
        result: had ? 'solid' : 'missed',
      },
    ];
    if (index + 1 >= questions.length) {
      onDone({ transcript: nextTranscript, verdicts: nextVerdicts });
      return;
    }
    setTranscript(nextTranscript);
    setVerdicts(nextVerdicts);
    setShown(false);
    setIndex(index + 1);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.progress}>
        {index + 1} of {questions.length}
      </Text>

      <View style={styles.middle}>
        <Text style={styles.language}>{lang?.name}</Text>
        <Text style={styles.gloss}>{question.set.gloss}</Text>

        {shown && rendering ? (
          <View style={styles.answer}>
            <Text style={styles.term}>{rendering.term}</Text>
            {rendering.say ? <Text style={styles.say}>{rendering.say}</Text> : null}
            {rendering.reading ? <Text style={styles.reading}>{rendering.reading}</Text> : null}
          </View>
        ) : null}
      </View>

      {shown ? (
        <View style={styles.actions}>
          <Pressable onPress={() => answer(false)} hitSlop={12}>
            <Text style={styles.quiet}>didn&apos;t</Text>
          </Pressable>
          <Pressable onPress={() => answer(true)} hitSlop={12}>
            <Text style={styles.loud}>had it</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setShown(true)} hitSlop={12} style={styles.actions}>
          <Text style={styles.loud}>show</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  progress: {
    color: colors.slate,
    fontSize: type.micro,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
  },
  language: {
    color: colors.slate,
    fontSize: type.small,
    marginBottom: space.xs,
  },
  gloss: {
    color: colors.paper,
    fontSize: 28,
    fontWeight: '500',
  },
  answer: {
    marginTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    paddingTop: space.md,
  },
  term: {
    color: colors.paper,
    fontSize: 34,
    fontWeight: '500',
  },
  say: {
    color: colors.paper,
    fontSize: type.body,
    opacity: 0.75,
    marginTop: space.xs,
  },
  reading: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: space.lg,
  },
  quiet: {
    color: colors.slate,
    fontSize: type.body,
  },
  loud: {
    color: colors.paper,
    fontSize: type.body,
    fontWeight: '600',
  },
});

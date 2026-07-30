import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
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
import { TapCheck } from '@/components/tap-check';
import { colors, space, type } from '@/constants/theme';
import { useApp } from '@/lib/app-state';
import {
  TURNS,
  applyVerdicts,
  checkPool,
  checkableLanguages,
  checkedToday,
  converse,
  loadChecks,
  saveCheck,
} from '@/lib/check';
import { logSession } from '@/lib/repo';
import type { CheckAsk, CheckRecord, CheckTurn, CheckVerdict, LexemeSet } from '@/lib/types';

type Stage = 'idle' | 'talking' | 'tapping' | 'done';

export default function Check() {
  const { setup } = useApp();
  const [stage, setStage] = useState<Stage>('idle');
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [today, setToday] = useState<CheckRecord | null>(null);
  const [pool, setPool] = useState<LexemeSet[]>([]);
  const [transcript, setTranscript] = useState<CheckTurn[]>([]);
  const [asked, setAsked] = useState<CheckAsk | null>(null);
  const [turn, setTurn] = useState(1);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const verdicts = useRef<CheckVerdict[]>([]);
  const startedAt = useRef<number | null>(null);
  const scroller = useRef<ScrollView>(null);

  const languages = checkableLanguages(setup.languages);

  const refresh = useCallback(() => {
    let cancelled = false;
    Promise.all([checkedToday(), loadChecks()]).then(([done, checks]) => {
      if (cancelled) return;
      setAlreadyDone(done);
      setToday(checks[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(refresh);

  const finish = useCallback(
    async (finalTranscript: CheckTurn[], finalVerdicts: CheckVerdict[]) => {
      const started = startedAt.current;
      startedAt.current = null;
      const minutes = started ? Math.max(1, Math.round((Date.now() - started) / 60000)) : 1;
      setStage('done');
      setTranscript(finalTranscript);
      await applyVerdicts(finalVerdicts);
      await saveCheck({ transcript: finalTranscript, verdicts: finalVerdicts, minutes });
      await logSession({ kind: 'check', minutes, note: '', languageCode: null });
      setAlreadyDone(true);
    },
    []
  );

  async function start() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const sets = await checkPool(languages);
      if (sets.length === 0) {
        setNote('Nothing in the bank to work with yet. The Feed fills it.');
        return;
      }
      setPool(sets);
      verdicts.current = [];
      startedAt.current = Date.now();

      const reply = await converse({ sets, languages, transcript: [], asked: null, turn: 1 });
      if (!reply) {
        // No server, no session, or it failed: the tap check does the same
        // job offline rather than showing an error wall.
        setStage('tapping');
        return;
      }
      setTranscript([{ role: 'app', text: reply.reply }]);
      setAsked(reply.ask);
      setTurn(2);
      setStage(reply.done || !reply.ask ? 'done' : 'talking');
      if (reply.done || !reply.ask) {
        await finish([{ role: 'app', text: reply.reply }], []);
      }
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = answer.trim();
    if (busy || !text) return;
    setBusy(true);
    setAnswer('');
    const withAnswer: CheckTurn[] = [...transcript, { role: 'you', text }];
    setTranscript(withAnswer);
    try {
      const reply = await converse({ sets: pool, languages, transcript: withAnswer, asked, turn });
      if (!reply) {
        // Lost mid-conversation. Keep what was already graded rather than
        // throwing the two minutes away.
        await finish(withAnswer, verdicts.current);
        return;
      }
      verdicts.current = [...verdicts.current, ...reply.verdicts];
      const next: CheckTurn[] = [...withAnswer, { role: 'app', text: reply.reply }];
      setTranscript(next);
      if (reply.done || !reply.ask || turn >= TURNS) {
        await finish(next, verdicts.current);
        return;
      }
      setAsked(reply.ask);
      setTurn(turn + 1);
    } finally {
      setBusy(false);
    }
  }

  if (languages.length === 0) {
    return (
      <Screen title="Check">
        <Text style={styles.flat}>
          Scripts first. The Check opens on a language once its script is marked learned.
        </Text>
      </Screen>
    );
  }

  if (stage === 'tapping') {
    return (
      <Screen title="Check">
        <TapCheck
          pool={pool}
          languages={languages}
          onDone={(result) => finish(result.transcript, result.verdicts)}
        />
      </Screen>
    );
  }

  if (stage === 'talking' || stage === 'done') {
    return (
      <Screen title="Check">
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}>
          <ScrollView
            ref={scroller}
            style={styles.fill}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.thread}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
            {transcript.map((t, i) => (
              <Text key={i} style={t.role === 'app' ? styles.app : styles.you}>
                {t.text}
              </Text>
            ))}
            {/* Only while there is still a turn coming. Saving the day
                afterwards is not something to keep you waiting on. */}
            {busy && stage === 'talking' ? <Text style={styles.thinking}>…</Text> : null}
          </ScrollView>

          {stage === 'talking' ? (
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                placeholder="answer"
                placeholderTextColor={colors.slate}
                value={answer}
                onChangeText={setAnswer}
                onSubmitEditing={send}
                returnKeyType="send"
                autoCorrect={false}
                autoCapitalize="none"
                editable={!busy}
              />
              <Pressable onPress={send} disabled={busy} hitSlop={12}>
                <Text style={styles.send}>{busy ? '…' : 'say'}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setStage('idle')} style={styles.composer} hitSlop={12}>
              <Text style={styles.quiet}>Done for today.</Text>
            </Pressable>
          )}
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  return (
    <Screen title="Check">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {alreadyDone ? (
          <>
            <Text style={styles.flat}>Done today.</Text>
            {today?.transcript.length ? (
              <View style={styles.past}>
                {today.transcript.map((t, i) => (
                  <Text key={i} style={t.role === 'app' ? styles.pastApp : styles.pastYou}>
                    {t.text}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.flat}>
              A short conversation. Two minutes, one language at a time.
            </Text>
            {note ? <Text style={styles.quiet}>{note}</Text> : null}
            <Pressable onPress={start} disabled={busy} hitSlop={12}>
              <Text style={styles.begin}>{busy ? '…' : 'Begin'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: space.xl },
  flat: {
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.6,
  },
  quiet: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: space.md,
  },
  begin: {
    color: colors.paper,
    fontSize: type.body,
    fontWeight: '600',
    marginTop: space.xl,
  },
  thread: {
    paddingBottom: space.lg,
    gap: space.md,
  },
  app: {
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.6,
  },
  you: {
    color: colors.slate,
    fontSize: type.body,
    lineHeight: type.body * 1.6,
    paddingLeft: space.lg,
  },
  thinking: {
    color: colors.slate,
    fontSize: type.body,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 6,
    color: colors.paper,
    fontSize: type.body,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  send: {
    color: colors.paper,
    fontSize: type.body,
    fontWeight: '600',
  },
  past: {
    marginTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    paddingTop: space.md,
    gap: space.sm,
  },
  pastApp: {
    color: colors.slate,
    fontSize: type.small,
    lineHeight: type.small * 1.6,
  },
  pastYou: {
    color: colors.slate,
    fontSize: type.small,
    lineHeight: type.small * 1.6,
    paddingLeft: space.md,
    opacity: 0.7,
  },
});

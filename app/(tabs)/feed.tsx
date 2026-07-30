import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { SetCard } from '@/components/set-card';
import { colors, space, type } from '@/constants/theme';
import { logSession } from '@/lib/repo';
import { grade } from '@/lib/scheduler';
import { dueSets, loadSetStates, refillIfLow, saveSetState } from '@/lib/sets';
import type { ContextTag, LexemeSet } from '@/lib/types';

const CONTEXTS: (ContextTag | 'any')[] = [
  'any',
  'café',
  'class',
  'transit',
  'gym',
  'home',
  'street',
];

export default function Feed() {
  const { width } = useWindowDimensions();
  const [context, setContext] = useState<ContextTag | 'any'>('any');
  const [cards, setCards] = useState<LexemeSet[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const startedAt = useRef<number | null>(null);
  const reviewed = useRef(0);

  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    dueSets('word', context)
      .then((sets) => {
        if (cancelled) return;
        setCards(sets);
        setIndex(0);
        x.value = 0;
        y.value = 0;
        startedAt.current = sets.length > 0 ? Date.now() : null;
        reviewed.current = 0;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Top the bank up behind the deck you're already holding.
    refillIfLow('word').then((added) => {
      if (added > 0 && !cancelled) {
        dueSets('word', context).then((sets) => {
          if (!cancelled) setCards((prev) => (prev.length === 0 ? sets : prev));
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  useFocusEffect(load);

  const finish = useCallback(async () => {
    const started = startedAt.current;
    startedAt.current = null;
    if (!started || reviewed.current === 0) return;
    const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
    await logSession({ kind: 'feed', minutes, note: '', languageCode: null });
  }, []);

  const commit = useCallback(async (set: LexemeSet, got: boolean) => {
    reviewed.current += 1;
    const states = await loadSetStates();
    const state = states.find((s) => s.setId === set.id);
    if (!state) return;
    await saveSetState(grade(state, got ? 'got' : 'again'));
  }, []);

  const advance = useCallback(
    (got: boolean) => {
      const card = cards[index];
      if (card) commit(card, got);
      x.value = 0;
      y.value = 0;
      setIndex((i) => {
        const next = i + 1;
        if (next >= cards.length) {
          finish();
          refillIfLow('word');
        }
        return next;
      });
    },
    [cards, index, commit, finish, x, y]
  );

  const threshold = width * 0.28;

  const pan = Gesture.Pan()
    .onChange((e) => {
      x.value += e.changeX;
      y.value += e.changeY;
    })
    .onEnd((e) => {
      const flung = Math.abs(x.value) > threshold || Math.abs(e.velocityX) > 800;
      if (flung) {
        const dir = x.value > 0 || e.velocityX > 0 ? 1 : -1;
        x.value = withTiming(dir * width * 1.6, { duration: 180 }, () => {
          runOnJS(advance)(dir > 0);
        });
        y.value = withTiming(y.value + e.velocityY * 0.08, { duration: 180 });
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 180 });
        y.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${interpolate(x.value, [-width, 0, width], [-12, 0, 12])}deg` },
    ],
  }));

  const nextStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(x.value) / threshold, 1);
    return {
      transform: [{ scale: interpolate(progress, [0, 1], [0.96, 1]) }],
      opacity: interpolate(progress, [0, 1], [0.5, 1]),
    };
  });

  const card = cards[index];
  const next = cards[index + 1];
  const remaining = Math.max(0, cards.length - index);

  return (
    <Screen title="Feed">
      <View style={styles.contexts}>
        {CONTEXTS.map((c) => {
          const active = context === c;
          return (
            <Pressable
              key={c}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setContext(c)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.stack} />
      ) : card ? (
        <>
          <View style={styles.stack}>
            {next ? (
              <Animated.View style={[styles.layer, nextStyle]} pointerEvents="none">
                <SetCard set={next} />
              </Animated.View>
            ) : null}
            <GestureDetector gesture={pan}>
              <Animated.View style={[styles.layer, topStyle]}>
                <SetCard set={card} />
              </Animated.View>
            </GestureDetector>
          </View>
          <View style={styles.footer}>
            <Pressable onPress={() => advance(false)} hitSlop={12}>
              <Text style={styles.hint}>← again</Text>
            </Pressable>
            <Text style={styles.count}>{remaining}</Text>
            <Pressable onPress={() => advance(true)} hitSlop={12}>
              <Text style={styles.hint}>got it →</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyLine}>
            {context === 'any'
              ? 'Nothing waiting. More is on its way — come back in a moment.'
              : `Nothing for ${context}. Try another context, or any.`}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  contexts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    paddingHorizontal: space.md - 2,
    paddingVertical: space.xs + 1,
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
  stack: {
    flex: 1,
    marginBottom: space.md,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.md,
  },
  hint: {
    color: colors.slate,
    fontSize: type.small,
  },
  count: {
    color: colors.slate,
    fontSize: type.micro,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyLine: {
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.6,
  },
});

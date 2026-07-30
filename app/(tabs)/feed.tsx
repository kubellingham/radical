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

import { CardFace } from '@/components/cards';
import { Screen } from '@/components/screen';
import { colors, space, type } from '@/constants/theme';
import { useApp } from '@/lib/app-state';
import { buildDeck, type Card } from '@/lib/deck';
import { loadItemStates, logSession, saveItemState } from '@/lib/repo';
import { grade } from '@/lib/scheduler';
import type { ContextTag } from '@/lib/types';

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
  const { setup } = useApp();
  const unlocked = setup.languages.filter((l) => l.scriptLearned).map((l) => l.code);

  const [context, setContext] = useState<ContextTag | 'any'>('any');
  const [cards, setCards] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const startedAt = useRef<number | null>(null);
  const reviewed = useRef(0);

  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    buildDeck({ unlocked, context })
      .then((deck) => {
        if (cancelled) return;
        setCards(deck.cards);
        setIndex(0);
        x.value = 0;
        y.value = 0;
        startedAt.current = deck.cards.length > 0 ? Date.now() : null;
        reviewed.current = 0;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, setup.languages]);

  useFocusEffect(load);

  const finish = useCallback(async () => {
    const started = startedAt.current;
    startedAt.current = null;
    if (!started || reviewed.current === 0) return;
    const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
    await logSession({ kind: 'feed', minutes, note: '', languageCode: null });
  }, []);

  const commit = useCallback(
    async (card: Card, got: boolean) => {
      reviewed.current += 1;
      const states = await loadItemStates();
      for (const id of card.itemIds) {
        const state = states.find((s) => s.itemId === id);
        if (!state) continue;
        await saveItemState(grade(state, got ? 'got' : 'again'));
      }
    },
    []
  );

  const advance = useCallback(
    (got: boolean) => {
      const card = cards[index];
      if (card) commit(card, got);
      x.value = 0;
      y.value = 0;
      setIndex((i) => {
        const next = i + 1;
        if (next >= cards.length) finish();
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
                <CardFace card={next} />
              </Animated.View>
            ) : null}
            <GestureDetector gesture={pan}>
              <Animated.View style={[styles.layer, topStyle]}>
                <CardFace card={card} />
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
            {unlocked.length === 0
              ? 'No language has its script marked learned yet. Start there — Today has the switch.'
              : cards.length > 0
                ? 'Deck done. Come back later, or capture something new in Found.'
                : context === 'any'
                  ? 'Nothing waiting. Capture what you learn in Found and it turns up here.'
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

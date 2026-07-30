import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '@/constants/theme';
import { DEFAULT_LANGUAGES } from '@/lib/languages';
import type { LexemeSet } from '@/lib/types';

// Fixed order so your eye learns where each language sits and stops
// searching for it. Same order on every card, forever.
const ORDER = DEFAULT_LANGUAGES.map((l) => l.code);

/**
 * One meaning, every language at once. Native script large; the reading
 * sits under it, quiet, so a script you can't read yet is still the thing
 * you're looking at rather than something you skip past.
 */
export function SetCard({ set }: { set: LexemeSet }) {
  const rows = ORDER.map((code) => set.renderings.find((r) => r.languageCode === code)).filter(
    (r): r is NonNullable<typeof r> => r !== undefined
  );
  const long = set.kind === 'sentence';

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.gloss}>{set.gloss}</Text>
        {set.sinoRoot ? <Text style={styles.root}>{set.sinoRoot}</Text> : null}
      </View>

      <View style={styles.rows}>
        {rows.map((r) => {
          const lang = DEFAULT_LANGUAGES.find((l) => l.code === r.languageCode);
          return (
            <View key={r.languageCode} style={styles.row}>
              <Text style={styles.glyph}>{lang?.glyph}</Text>
              <View style={styles.termCell}>
                <Text
                  style={[styles.term, long && styles.termLong]}
                  adjustsFontSizeToFit
                  numberOfLines={long ? 3 : 1}>
                  {r.term}
                </Text>
                {/* How to say it comes first — it is what you need to speak. */}
                {r.say ? <Text style={styles.say}>{r.say}</Text> : null}
                {r.reading ? <Text style={styles.reading}>{r.reading}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 12,
    backgroundColor: colors.ink,
    padding: space.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  gloss: {
    color: colors.slate,
    fontSize: type.small,
    flex: 1,
  },
  root: {
    color: colors.slate,
    fontSize: type.small,
  },
  rows: {
    flex: 1,
    justifyContent: 'space-evenly',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  glyph: {
    color: colors.slate,
    fontSize: type.body,
    width: 32,
  },
  termCell: {
    flex: 1,
  },
  term: {
    color: colors.paper,
    fontSize: 27,
    fontWeight: '500',
  },
  termLong: {
    fontSize: 18,
    lineHeight: 24,
  },
  say: {
    color: colors.paper,
    fontSize: type.small,
    opacity: 0.75,
    marginTop: 2,
  },
  reading: {
    color: colors.slate,
    fontSize: type.micro,
    marginTop: 1,
  },
});

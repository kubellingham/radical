import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '@/constants/theme';
import type { Card } from '@/lib/deck';
import { languageByCode } from '@/lib/languages';
import type { LanguageCode } from '@/lib/types';

export function CardFace({ card }: { card: Card }) {
  switch (card.kind) {
    case 'triple':
      return <TripleCard card={card} />;
    case 'friend':
      return <FriendCard card={card} />;
    default:
      return <StandardCard card={card} />;
  }
}

function StandardCard({ card }: { card: Extract<Card, { kind: 'standard' }> }) {
  return (
    <View style={styles.card}>
      <Text style={styles.corner}>{languageByCode(card.languageCode)?.glyph}</Text>
      <View style={styles.center}>
        <Text style={styles.term} adjustsFontSizeToFit numberOfLines={2}>
          {card.term}
        </Text>
        {card.reading ? <Text style={styles.reading}>{card.reading}</Text> : null}
        <Text style={styles.meaning}>{card.meaning}</Text>
      </View>
      {card.example ? <Text style={styles.example}>{card.example}</Text> : null}
    </View>
  );
}

// The signature card: one character, three readings fanned beneath it,
// meaning small at the bottom. Nothing else belongs here.
function TripleCard({ card }: { card: Extract<Card, { kind: 'triple' }> }) {
  return (
    <View style={styles.card}>
      <View style={styles.center}>
        <Text style={styles.display} adjustsFontSizeToFit numberOfLines={1}>
          {card.root}
        </Text>
        <View style={styles.fan}>
          {card.readings.map((r) => (
            <View key={r.code} style={styles.fanCell}>
              <Text style={styles.fanTerm}>{r.term}</Text>
              {r.reading ? <Text style={styles.fanReading}>{r.reading}</Text> : null}
              <Text style={styles.fanLang}>{label(r.code)}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.footMeaning}>{card.meaning}</Text>
    </View>
  );
}

function FriendCard({ card }: { card: Extract<Card, { kind: 'friend' }> }) {
  return (
    <View style={styles.card}>
      <View style={styles.center}>
        <Text style={styles.display} adjustsFontSizeToFit numberOfLines={1}>
          {card.term}
        </Text>
        <View style={styles.opposition}>
          <View style={styles.oppSide}>
            <Text style={styles.oppMeaning}>{card.a.meaning}</Text>
            <Text style={styles.oppLang}>{label(card.a.code)}</Text>
          </View>
          <Text style={styles.oppRule}>|</Text>
          <View style={styles.oppSide}>
            <Text style={styles.oppMeaning}>{card.b.meaning}</Text>
            <Text style={styles.oppLang}>{label(card.b.code)}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.footMeaning}>Same characters. Different worlds.</Text>
    </View>
  );
}

function label(code: LanguageCode): string {
  return languageByCode(code)?.name ?? code;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 12,
    backgroundColor: colors.ink,
    padding: space.lg,
    justifyContent: 'space-between',
  },
  corner: {
    color: colors.slate,
    fontSize: type.body,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  term: {
    color: colors.paper,
    fontSize: 52,
    fontWeight: '500',
    textAlign: 'center',
  },
  reading: {
    color: colors.slate,
    fontSize: type.body,
    marginTop: space.sm,
  },
  meaning: {
    color: colors.paper,
    fontSize: type.body,
    marginTop: space.lg,
    textAlign: 'center',
  },
  example: {
    color: colors.slate,
    fontSize: type.small,
    lineHeight: type.small * 1.6,
    textAlign: 'center',
  },
  display: {
    color: colors.paper,
    fontSize: type.display,
    lineHeight: type.display * 1.1,
    fontWeight: '400',
  },
  fan: {
    flexDirection: 'row',
    marginTop: space.xl,
    gap: space.lg,
  },
  fanCell: {
    alignItems: 'center',
  },
  fanTerm: {
    color: colors.paper,
    fontSize: type.body,
  },
  fanReading: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: 2,
  },
  fanLang: {
    color: colors.slate,
    fontSize: type.micro,
    marginTop: space.xs,
  },
  footMeaning: {
    color: colors.slate,
    fontSize: type.small,
    textAlign: 'center',
  },
  opposition: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xl,
    gap: space.lg,
  },
  oppSide: {
    alignItems: 'center',
    maxWidth: 130,
  },
  oppMeaning: {
    color: colors.paper,
    fontSize: type.body,
    textAlign: 'center',
  },
  oppLang: {
    color: colors.slate,
    fontSize: type.micro,
    marginTop: space.xs,
  },
  oppRule: {
    color: colors.rule,
    fontSize: type.title,
  },
});

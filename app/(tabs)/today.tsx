import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { colors, space, type } from '@/constants/theme';
import { useApp } from '@/lib/app-state';

function statusLine(scriptLearned: boolean, status: string, slot: string): string {
  if (!scriptLearned) return 'script mode — learn the script first';
  return slot === 'any' ? status : `${status} · ${slot}`;
}

export default function Today() {
  const { setup } = useApp();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Screen title="Today">
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.date}>{today}</Text>

        {setup.languages.map((lang, i) => (
          <View key={lang.code} style={[styles.row, i > 0 && styles.rowRule]}>
            <Text style={styles.glyph}>{lang.glyph}</Text>
            <View style={styles.rowText}>
              <Text style={styles.name}>{lang.name}</Text>
              <Text style={styles.status}>
                {statusLine(lang.scriptLearned, lang.status, lang.rhythmSlot)}
              </Text>
            </View>
          </View>
        ))}

        <Text style={styles.footer}>
          Missions and the drift watch arrive in Phase 4. Until then: Dump what you learn, and the
          scripts come first.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  date: {
    color: colors.slate,
    fontSize: type.small,
    marginBottom: space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
  },
  rowRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
  },
  glyph: {
    color: colors.paper,
    fontSize: type.glyph,
    width: 56,
  },
  rowText: {
    flex: 1,
  },
  name: {
    color: colors.paper,
    fontSize: type.body,
    fontWeight: '600',
  },
  status: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: 2,
  },
  footer: {
    color: colors.slate,
    fontSize: type.small,
    lineHeight: type.small * 1.6,
    marginTop: space.xl,
    marginBottom: space.xl,
  },
});

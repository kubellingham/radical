import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '@/constants/theme';

/**
 * The only thing shown before the app has read its local store. Never a
 * blank screen — a blank screen reads as broken, and this is the first
 * thing seen on every single launch for five years.
 */
export function Booting({ note }: { note?: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.mark}>語</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    color: colors.paper,
    fontSize: 48,
  },
  note: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: space.md,
  },
});

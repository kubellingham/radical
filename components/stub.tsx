import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, space, type } from '@/constants/theme';

/**
 * A mode that isn't built yet. Says what it will be and when, flatly —
 * an empty screen should say what happens next, not "nothing here".
 */
export function Stub({ lines, phase }: { lines: string[]; phase: number }) {
  return (
    <>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      <Text style={styles.phase}>Builds in Phase {phase}.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  line: {
    color: colors.paper,
    fontSize: type.body,
    lineHeight: type.body * 1.6,
    marginBottom: space.md,
  },
  phase: {
    color: colors.slate,
    fontSize: type.small,
    marginTop: space.sm,
  },
});

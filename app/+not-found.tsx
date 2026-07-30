import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/screen';
import { colors, space, type } from '@/constants/theme';

export default function NotFound() {
  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.line}>Nothing at this address.</Text>
      <Link href="/" style={styles.link}>
        Back to Today
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: {
    color: colors.paper,
    fontSize: type.body,
    marginTop: space.xl,
  },
  link: {
    color: colors.slate,
    fontSize: type.body,
    marginTop: space.md,
    textDecorationLine: 'underline',
  },
});

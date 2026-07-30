import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, space, type } from '@/constants/theme';

// Tab screens keep the default edges — the tab bar owns the bottom inset.
// Full-screen routes (setup, sign-in) pass 'bottom' too so content clears
// the home indicator.
const DEFAULT_EDGES: Edge[] = ['top', 'left', 'right'];

export function Screen({
  title,
  children,
  style,
  edges = DEFAULT_EDGES,
}: {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: Edge[];
}) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <View style={[styles.body, style]}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  body: {
    flex: 1,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  title: {
    color: colors.paper,
    fontSize: type.title,
    fontWeight: '600',
    marginBottom: space.lg,
  },
});

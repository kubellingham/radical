import { Redirect } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { colors } from '@/constants/theme';
import { supabaseConfigured, useApp } from '@/lib/app-state';

export default function Index() {
  const { ready, resolving, session, setup } = useApp();

  if (!ready || resolving) {
    // Ink while the local store loads or a signed-in fresh install checks
    // Supabase for existing setup. Showing the form early would invite a
    // second device to overwrite the first one's config.
    return <View style={{ flex: 1, backgroundColor: colors.ink }} />;
  }
  if (supabaseConfigured && !session) {
    return <Redirect href="/sign-in" />;
  }
  if (!setup.completed) {
    return <Redirect href="/setup" />;
  }
  return <Redirect href="/today" />;
}

import { Redirect } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { colors } from '@/constants/theme';
import { supabaseConfigured, useApp } from '@/lib/app-state';

export default function Index() {
  const { ready, session, setup } = useApp();

  if (!ready) {
    // One frame of ink while the local store loads.
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

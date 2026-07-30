import { Tabs } from 'expo-router';
import React from 'react';

import { colors } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.ink },
        tabBarActiveTintColor: colors.paper,
        tabBarInactiveTintColor: colors.slate,
        tabBarStyle: {
          backgroundColor: colors.ink,
          borderTopColor: colors.rule,
        },
        // Labels only. The tab bar is typographic, like everything else.
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelPosition: 'beside-icon',
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="found" options={{ title: 'Found' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="check" options={{ title: 'Check' }} />
      <Tabs.Screen name="record" options={{ title: 'Record' }} />
    </Tabs>
  );
}

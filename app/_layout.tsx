import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { colors } from '@/constants/theme';
import { AppProvider } from '@/lib/app-state';

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.paper,
    background: colors.ink,
    card: colors.ink,
    text: colors.paper,
    border: colors.rule,
    notification: colors.paper,
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ink }}>
      <AppProvider>
        <ThemeProvider value={theme}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.ink },
            }}>
            <Stack.Screen name="(tabs)" />
            {/* Gate screens: no swipe-back past sign-in or setup. */}
            <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
            <Stack.Screen name="sign-in" options={{ gestureEnabled: false }} />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}

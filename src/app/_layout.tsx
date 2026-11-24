import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LibraryProvider } from '../library/LibraryContext';
import { useAppTheme } from '../ui/theme';

export default function RootLayout() {
  const theme = useAppTheme();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.bg).catch(() => {});
  }, [theme.bg]);

  return (
    <SafeAreaProvider>
      <LibraryProvider>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
          <Stack.Screen name="index" />
          {/* Swipe-back would fight page swipes, so the reader closes with its back button. */}
          <Stack.Screen name="reader/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        </Stack>
      </LibraryProvider>
    </SafeAreaProvider>
  );
}

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense } from 'react';
import { useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { CloudAiSync } from '@/components/cloud-ai-sync';
import { migrateDatabaseIfNeeded } from '@/lib/db';

SplashScreen.preventAutoHideAsync();

function themeFor(dark: boolean) {
  const c = Colors[dark ? 'dark' : 'light'];
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.background,
      card: c.backgroundElement,
      text: c.text,
      border: c.hairline,
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  return (
    <ThemeProvider value={themeFor(dark)}>
      <Suspense
        fallback={
          <View style={{ flex: 1, backgroundColor: Colors[dark ? 'dark' : 'light'].background }} />
        }
      >
        <SQLiteProvider
          databaseName="styleme.db"
          onInit={migrateDatabaseIfNeeded}
          useSuspense
        >
          <Stack>
            {/* Headers off everywhere: each screen renders its own header row,
                so none of them need the generic "item/[id]"-style title bar. */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="add-item"
              options={{ presentation: 'modal', headerShown: false }}
            />
            <Stack.Screen
              name="item/[id]"
              options={{ presentation: 'modal', headerShown: false }}
            />
          </Stack>
          <CloudAiSync />
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}

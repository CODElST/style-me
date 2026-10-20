import { NativeTabs } from 'expo-router/native-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const c = Colors[scheme === 'dark' ? 'dark' : 'light'];

  // The SQLite provider has finished initializing by now — safe to reveal.
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <NativeTabs
      backgroundColor={c.background}
      indicatorColor={c.accentSoft}
      iconColor={{ default: c.textSecondary, selected: c.accent }}
      labelStyle={{ selected: { color: c.text } }}
      tintColor={c.accent}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max" md="sunny" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="closet">
        <NativeTabs.Trigger.Label>Closet</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="tshirt" md="checkroom" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="build">
        <NativeTabs.Trigger.Label>Builder</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wand.and.stars" md="auto_awesome" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Label>Rack</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="heart" md="favorite" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

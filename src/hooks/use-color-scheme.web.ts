import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * `useColorScheme` from react-native is safe during SSR — it falls back to `light`
 * until hydration, so no hydration state is tracked here.
 */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() ?? 'light';
}

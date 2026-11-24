import { Platform, useColorScheme } from 'react-native';

/** App chrome palette (library, settings). The reader has its own page themes. */
export interface AppTheme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  danger: string;
  shadow: string;
}

export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: undefined });
export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined });

const light: AppTheme = {
  dark: false,
  bg: '#F6F3EC',
  surface: '#FFFDF8',
  surfaceAlt: '#EEE9DE',
  border: '#E2DDD1',
  text: '#1F1D1A',
  textMuted: '#6B665D',
  textFaint: '#9A948A',
  accent: '#0F6E56',
  accentText: '#FFFFFF',
  accentSoft: '#DCEFE7',
  danger: '#B3261E',
  shadow: '#3B2F1A',
};

const dark: AppTheme = {
  dark: true,
  bg: '#14130F',
  surface: '#1E1C18',
  surfaceAlt: '#2A2722',
  border: '#34312A',
  text: '#ECE7DC',
  textMuted: '#A29C90',
  textFaint: '#77736B',
  accent: '#5DCAA5',
  accentText: '#0B2A21',
  accentSoft: '#173A30',
  danger: '#F2B8B5',
  shadow: '#000000',
};

export function useAppTheme(): AppTheme {
  return useColorScheme() === 'dark' ? dark : light;
}

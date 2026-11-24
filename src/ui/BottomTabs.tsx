import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppTheme } from './theme';

export interface TabOption<T extends string> {
  value: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Filled variant shown when the tab is selected. */
  iconSelected: keyof typeof Ionicons.glyphMap;
}

interface Props<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  theme: AppTheme;
}

export const TAB_BAR_HEIGHT = 54;

/** iOS-style bottom tab bar: icon over label, tinted when selected. */
export function BottomTabs<T extends string>({ options, value, onChange, theme }: Props<T>) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.surface, borderTopColor: theme.border },
      ]}
      accessibilityRole="tablist"
    >
      {options.map((o) => {
        const isSelected = o.value === value;
        const color = isSelected ? theme.accent : theme.textMuted;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={o.label}
          >
            <Ionicons name={isSelected ? o.iconSelected : o.icon} size={24} color={color} />
            <Text style={[styles.label, { color }, isSelected && styles.labelSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tab: { flex: 1, height: TAB_BAR_HEIGHT - 6, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, fontWeight: '500', letterSpacing: 0.1 },
  labelSelected: { fontWeight: '700' },
});

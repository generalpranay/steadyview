import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export interface SegmentColors {
  track: string;
  border: string;
  selected: string;
  selectedText: string;
  text: string;
}

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  colors: SegmentColors;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

export function Segmented<T extends string>({ options, value, onChange, colors, accessibilityLabel, style }: Props<T>) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.track, borderColor: colors.border }, style]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[styles.option, selected && { backgroundColor: colors.selected }]}
          >
            <Text
              numberOfLines={1}
              style={[styles.text, { color: selected ? colors.selectedText : colors.text }, selected && styles.textSel]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, padding: 3 },
  option: { flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  text: { fontSize: 14 },
  textSel: { fontWeight: '600' },
});

import { StyleSheet, View } from 'react-native';

export function ProgressBar({ value, color, track, height = 3 }: { value: number; color: string; track: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={[styles.track, { backgroundColor: track, height, borderRadius: height }]}
    >
      <View style={{ width: `${pct}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({ track: { overflow: 'hidden', width: '100%' } });

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GimbalValues } from '../steadyview';
import { mono } from '../ui/theme';

const f = (n: number, d = 2) => (n >= 0 ? ' ' : '') + n.toFixed(d);

/** Live numbers for tuning on a real device (Settings → Show sensor readout). */
export function SensorReadout({ values, color, bg }: { values: GimbalValues; color: string; bg: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 125);
    return () => clearInterval(id);
  }, []);
  const i = values.input.value;
  const line = [styles.t, { color, fontFamily: mono }];
  return (
    <View pointerEvents="none" style={[styles.box, { backgroundColor: bg }]}>
      <Text style={line}>{`accel x${f(i.ux)} y${f(i.uy)}  gyro${f(i.gz)}`}</Text>
      <Text style={line}>
        {`shake ${values.shake.value.toFixed(2)}  gain ${values.appliedGain.value.toFixed(2)}  ` +
          `dx${f(values.translateX.value, 1)} dy${f(values.translateY.value, 1)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 12, right: 12, borderRadius: 8, padding: 8, opacity: 0.92 },
  t: { fontSize: 11 },
});

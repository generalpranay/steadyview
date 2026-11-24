import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import type { BookKind, Prefs } from '../library/types';
import type { GimbalValues, Strength } from '../steadyview';
import { Segmented, type SegmentColors } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { FONT_LABELS, FONT_STEPS, PAGE_THEMES, THEME_ORDER, type PageTheme } from './themes';

interface Props {
  visible: boolean;
  onClose: () => void;
  kind: BookKind;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  theme: PageTheme;
  gimbal: GimbalValues;
  sensorsAvailable: boolean;
}

const STRENGTHS: { value: Strength; label: string }[] = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'strong', label: 'Strong' },
];

export function AaSheet({ visible, onClose, kind, prefs, setPrefs, theme, gimbal, sensorsAvailable }: Props) {
  const t = theme;
  const seg: SegmentColors = {
    track: t.dark ? '#00000033' : '#00000008',
    border: t.chromeBorder,
    selected: t.dark ? t.fg : '#FFFFFF',
    selectedText: t.dark ? t.bg : t.fg,
    text: t.muted,
  };
  const isEpub = kind === 'epub';
  const pct = FONT_STEPS[prefs.fontStep];

  return (
    <Sheet visible={visible} onClose={onClose} bg={t.chrome} fg={t.fg} border={t.chromeBorder} maxHeightRatio={0.82}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 8 }}>
        {isEpub && (
          <View style={[styles.sizeRow, { backgroundColor: seg.track, borderColor: t.chromeBorder }]}>
            <Pressable
              style={styles.sizeBtn}
              disabled={prefs.fontStep === 0}
              onPress={() => setPrefs({ fontStep: Math.max(0, prefs.fontStep - 1) })}
              accessibilityRole="button"
              accessibilityLabel="Smaller text"
            >
              <Text style={[styles.smallA, { color: prefs.fontStep === 0 ? t.muted : t.fg }]}>A</Text>
            </Pressable>
            <Text style={[styles.sizeVal, { color: t.muted }]}>{pct}%</Text>
            <Pressable
              style={styles.sizeBtn}
              disabled={prefs.fontStep === FONT_STEPS.length - 1}
              onPress={() => setPrefs({ fontStep: Math.min(FONT_STEPS.length - 1, prefs.fontStep + 1) })}
              accessibilityRole="button"
              accessibilityLabel="Larger text"
            >
              <Text style={[styles.bigA, { color: prefs.fontStep === FONT_STEPS.length - 1 ? t.muted : t.fg }]}>A</Text>
            </Pressable>
          </View>
        )}

        <View>
          <Text style={[styles.label, { color: t.muted }]}>Page</Text>
          <View style={styles.themes}>
            {THEME_ORDER.map((name) => {
              const th = PAGE_THEMES[name];
              const sel = prefs.theme === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setPrefs({ theme: name });
                  }}
                  style={styles.themeItem}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${th.label} theme`}
                >
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: th.bg, borderColor: sel ? t.link : t.chromeBorder, borderWidth: sel ? 2.5 : 1 },
                    ]}
                  >
                    <Text style={[styles.swatchText, { color: th.fg }]}>Aa</Text>
                  </View>
                  <Text style={[styles.themeLabel, { color: sel ? t.fg : t.muted }, sel && { fontWeight: '700' }]}>
                    {th.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {isEpub && (
          <>
            <View>
              <Text style={[styles.label, { color: t.muted }]}>Typeface</Text>
              <Segmented
                options={FONT_LABELS}
                value={prefs.fontFamily}
                onChange={(fontFamily) => setPrefs({ fontFamily })}
                colors={seg}
                accessibilityLabel="Typeface"
              />
            </View>
            <View>
              <View>
                <Text style={[styles.label, { color: t.muted }]}>Line spacing</Text>
                <Segmented
                  options={[
                    { value: 'compact', label: 'Tight' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'relaxed', label: 'Loose' },
                  ]}
                  value={prefs.spacing}
                  onChange={(spacing) => setPrefs({ spacing: spacing as Prefs['spacing'] })}
                  colors={seg}
                  accessibilityLabel="Line spacing"
                />
              </View>
            </View>
            <View>
              <Text style={[styles.label, { color: t.muted }]}>Margins</Text>
              <Segmented
                options={[
                  { value: 'narrow', label: 'Narrow' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'wide', label: 'Wide' },
                ]}
                value={prefs.margins}
                onChange={(margins) => setPrefs({ margins: margins as Prefs['margins'] })}
                colors={seg}
                accessibilityLabel="Margins"
              />
            </View>
            <Row
              theme={t}
              icon="reorder-four-outline"
              title="Justify text"
              value={prefs.justify}
              onChange={(justify) => setPrefs({ justify })}
            />
          </>
        )}

        <View style={[styles.steadyCard, { borderColor: t.chromeBorder, backgroundColor: seg.track }]}>
          <View style={styles.steadyHead}>
            <View style={[styles.steadyIcon, { backgroundColor: prefs.gimbal ? t.link : t.chromeBorder }]}>
              <Ionicons name="scan-outline" size={18} color={prefs.gimbal ? t.bg : t.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.steadyTitle, { color: t.fg }]}>Steady Mode</Text>
              <Text style={[styles.steadySub, { color: t.muted }]}>
                {!sensorsAvailable
                  ? 'Motion sensors unavailable on this device'
                  : prefs.gimbal
                    ? 'Holds the page still against shakes'
                    : 'A gimbal for your page. Off'}
              </Text>
            </View>
            <Switch
              value={prefs.gimbal}
              disabled={!sensorsAvailable}
              onValueChange={(gimbal) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setPrefs({ gimbal });
              }}
              trackColor={{ true: t.link, false: t.chromeBorder }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={t.chromeBorder}
              accessibilityLabel="Steady Mode"
            />
          </View>
          {prefs.gimbal && (
            <View style={{ gap: 14, marginTop: 14 }}>
              <Segmented
                options={STRENGTHS}
                value={prefs.strength}
                onChange={(strength) => setPrefs({ strength })}
                colors={seg}
                accessibilityLabel="Steady strength"
              />
              <MotionMeter gimbal={gimbal} theme={t} />
              {isEpub && (
                <Row
                  theme={t}
                  icon="text-outline"
                  title="Enlarge text when shaking"
                  value={prefs.enlargeOnShake}
                  onChange={(enlargeOnShake) => setPrefs({ enlargeOnShake })}
                />
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </Sheet>
  );
}

function Row({
  theme,
  icon,
  title,
  value,
  onChange,
}: {
  theme: PageTheme;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={theme.muted} />
      <Text style={[styles.rowTitle, { color: theme.fg }]}>{title}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.link, false: theme.chromeBorder }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={theme.chromeBorder}
        accessibilityLabel={title}
      />
    </View>
  );
}

/** Live "is the gimbal working" meter: dot glows when it is actively correcting. */
function MotionMeter({ gimbal, theme }: { gimbal: GimbalValues; theme: PageTheme }) {
  const bar = useAnimatedStyle(() => ({
    transform: [{ scaleX: withTiming(Math.min(1, gimbal.shake.value / 3), { duration: 120 }) }],
  }));
  const dot = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * Math.min(1, gimbal.appliedGain.value / 0.5) }));
  return (
    <View style={styles.meterRow} accessibilityLabel="Motion level">
      <Animated.View style={[styles.meterDot, { backgroundColor: theme.link }, dot]} />
      <Text style={[styles.meterLabel, { color: theme.muted }]}>Motion</Text>
      <View style={[styles.meterTrack, { backgroundColor: theme.chromeBorder }]}>
        <Animated.View style={[styles.meterFill, { backgroundColor: theme.link }, bar]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  sizeBtn: { width: 72, height: 48, alignItems: 'center', justifyContent: 'center' },
  smallA: { fontSize: 15, fontWeight: '600' },
  bigA: { fontSize: 25, fontWeight: '600' },
  sizeVal: { fontSize: 13, fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  themes: { flexDirection: 'row', justifyContent: 'space-between' },
  themeItem: { alignItems: 'center', gap: 6, flex: 1 },
  swatch: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  swatchText: { fontSize: 18, fontWeight: '600' },
  themeLabel: { fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { flex: 1, fontSize: 15 },
  steadyCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  steadyHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  steadyIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  steadyTitle: { fontSize: 16, fontWeight: '700' },
  steadySub: { fontSize: 13, marginTop: 1 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterDot: { width: 8, height: 8, borderRadius: 4 },
  meterLabel: { fontSize: 13, width: 52 },
  meterTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  meterFill: { height: 5, borderRadius: 3, width: '100%', transformOrigin: 'left' },
});

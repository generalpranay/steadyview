import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLibrary } from '../library/LibraryContext';
import type { Strength } from '../steadyview';
import { Segmented } from '../ui/Segmented';
import { serif, useAppTheme, type AppTheme } from '../ui/theme';

const STRENGTHS: { value: Strength; label: string }[] = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'strong', label: 'Strong' },
];
const LEADS = [
  { value: '0', label: '0 ms' },
  { value: '8', label: '8 ms' },
  { value: '16', label: '16 ms' },
  { value: '24', label: '24 ms' },
];

export default function SettingsScreen() {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const { prefs, setPrefs, books } = useLibrary();
  const s = makeStyles(t);
  const seg = { track: t.surfaceAlt, border: t.border, selected: t.surface, selectedText: t.text, text: t.textMuted };

  return (
    <View style={s.root}>
      <View style={s.navBar}>
        <Text style={s.navTitle}>Settings</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={[s.done, { color: t.accent }]}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 30, gap: 26 }}>
        <View style={[s.hero, { backgroundColor: t.accentSoft }]}>
          <Ionicons name="scan-outline" size={28} color={t.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[s.heroTitle, { color: t.text }]}>Steady Mode</Text>
            <Text style={[s.heroText, { color: t.textMuted }]}>
              A gimbal for your page. When the bus shakes or your hand trembles, the page moves against the shake so the
              words stay put. When your phone is still, the page is completely still.
            </Text>
          </View>
        </View>

        <Section title="Steady Mode" theme={t}>
          <ToggleRow
            theme={t}
            title="Turn on when opening a book"
            sub="You can always switch it from the reader's top bar"
            value={prefs.gimbal}
            onChange={(gimbal) => setPrefs({ gimbal })}
          />
          <View style={s.rowBlock}>
            <Text style={s.rowTitle}>Strength</Text>
            <Text style={s.rowSub}>Gentle makes small, quick corrections. Strong cancels more but settles slower.</Text>
            <Segmented
              options={STRENGTHS}
              value={prefs.strength}
              onChange={(strength) => setPrefs({ strength })}
              colors={seg}
              accessibilityLabel="Strength"
              style={{ marginTop: 10 }}
            />
          </View>
          <ToggleRow
            theme={t}
            title="Enlarge text when shaking"
            sub="EPUB text grows a little on rough rides"
            value={prefs.enlargeOnShake}
            onChange={(enlargeOnShake) => setPrefs({ enlargeOnShake })}
          />
        </Section>

        <Section title="Advanced" theme={t}>
          <View style={s.rowBlock}>
            <Text style={s.rowTitle}>Latency compensation</Text>
            <Text style={s.rowSub}>
              If the page seems to chase the shake instead of cancelling it, try 8 or 16 ms.
            </Text>
            <Segmented
              options={LEADS}
              value={String(prefs.leadMs)}
              onChange={(v) => setPrefs({ leadMs: Number(v) })}
              colors={seg}
              accessibilityLabel="Latency compensation"
              style={{ marginTop: 10 }}
            />
          </View>
          <ToggleRow
            theme={t}
            title="Show sensor readout"
            sub="Live motion numbers in the reader, for tuning"
            value={prefs.showSensorReadout}
            onChange={(showSensorReadout) => setPrefs({ showSensorReadout })}
          />
        </Section>

        <Section title="About" theme={t}>
          <InfoRow theme={t} label="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
          <InfoRow theme={t} label="Books" value={String(books.length)} />
          <InfoRow theme={t} label="Formats" value="EPUB, PDF" />
        </Section>
        <Text style={s.footer}>Books stay on this device. Nothing is uploaded.</Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, theme, children }: { title: string; theme: AppTheme; children: ReactNode }) {
  const s = makeStyles(theme);
  return (
    <View>
      <Text style={s.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}

function ToggleRow({
  theme,
  title,
  sub,
  value,
  onChange,
}: {
  theme: AppTheme;
  title: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const s = makeStyles(theme);
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {!!sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.accent, false: theme.border }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={theme.border}
        accessibilityLabel={title}
      />
    </View>
  );
}

function InfoRow({ theme, label, value }: { theme: AppTheme; label: string; value: string }) {
  const s = makeStyles(theme);
  return (
    <View style={s.row}>
      <Text style={[s.rowTitle, { flex: 1 }]}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (t: AppTheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 10,
    },
    navTitle: { fontSize: 28, fontWeight: '800', color: t.text, fontFamily: serif },
    done: { fontSize: 17, fontWeight: '600' },
    hero: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: 16 },
    heroTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
    heroText: { fontSize: 14, lineHeight: 20 },
    sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: t.textMuted, marginBottom: 8, marginLeft: 4 },
    card: {
      backgroundColor: t.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      paddingHorizontal: 16,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    rowBlock: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    rowTitle: { fontSize: 16, color: t.text },
    rowSub: { fontSize: 13, color: t.textMuted, marginTop: 2, lineHeight: 18 },
    rowValue: { fontSize: 15, color: t.textMuted },
    footer: { fontSize: 13, color: t.textFaint, textAlign: 'center' },
  });

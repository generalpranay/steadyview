import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Sheet background and text colours (follows the reader theme). */
  bg: string;
  fg: string;
  border: string;
  maxHeightRatio?: number;
  headerRight?: ReactNode;
  children: ReactNode;
}

/** Bottom sheet with a dimmed backdrop; tap outside or the grabber to close. */
export function Sheet({ visible, onClose, title, bg, fg, border, maxHeightRatio = 0.75, headerRight, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.duration(260)}
          style={[
            styles.sheet,
            { backgroundColor: bg, borderColor: border, paddingBottom: Math.max(insets.bottom, 16), maxHeight: `${maxHeightRatio * 100}%` },
          ]}
        >
          <Pressable onPress={onClose} style={styles.grabArea} accessibilityLabel="Close sheet">
            <View style={[styles.grabber, { backgroundColor: fg, opacity: 0.25 }]} />
          </Pressable>
          {(title || headerRight) && (
            <View style={styles.header}>
              <Text style={[styles.title, { color: fg }]}>{title}</Text>
              {headerRight}
            </View>
          )}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
  },
  grabArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  grabber: { width: 38, height: 5, borderRadius: 3 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  title: { fontSize: 18, fontWeight: '700' },
});

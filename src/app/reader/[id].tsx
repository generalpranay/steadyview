import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { locationsFile, newId, writeCoverDataUrl } from '../../library/files';
import { useLibrary } from '../../library/LibraryContext';
import type { Book } from '../../library/types';
import { AaSheet } from '../../reader/AaSheet';
import { BookView, type BookViewHandle, type GotoTarget, type ReaderEvent, type Relocated, type TocItem } from '../../reader/BookView';
import { SensorReadout } from '../../reader/SensorReadout';
import { PAGE_THEMES, webSettings } from '../../reader/themes';
import { TocSheet } from '../../reader/TocSheet';
import { GimbalDriver, nextTransitState, SteadyView, useGimbalValues, type TransitState } from '../../steadyview';

const HEADER_H = 30;
const FOOTER_H = 30;

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getBook, books } = useLibrary();
  const book = useMemo(() => books.find((b) => b.id === id) ?? getBook(id), [books, getBook, id]);

  if (!book) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Text>This book is no longer in your library.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '700' }}>Back</Text>
        </Pressable>
      </View>
    );
  }
  return <Reader book={book} />;
}

function Reader({ book }: { book: Book }) {
  const insets = useSafeAreaInsets();
  const { prefs, setPrefs, updateBook } = useLibrary();
  const theme = PAGE_THEMES[prefs.theme];
  const view = useRef<BookViewHandle>(null);
  const gimbal = useGimbalValues();

  const [chrome, setChrome] = useState(false);
  const [aaOpen, setAaOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [loc, setLoc] = useState<Relocated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [sensorsAvailable, setSensorsAvailable] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // ---- "Enlarge text when shaking" (EPUB + Steady Mode only)
  const [boosted, setBoosted] = useState(false);
  const transit = useRef<TransitState>({ active: false, heldFor: 0 });
  const boostOn = prefs.gimbal && prefs.enlargeOnShake && book.kind === 'epub';
  useEffect(() => {
    if (!boostOn) {
      transit.current = { active: false, heldFor: 0 };
      setBoosted(false);
      return;
    }
    const id = setInterval(() => {
      transit.current = nextTransitState(transit.current, gimbal.shake.value, 0.25);
      setBoosted(transit.current.active);
    }, 250);
    return () => clearInterval(id);
  }, [boostOn, gimbal.shake]);

  // Hiding the status bar with the menus can shrink the safe-area insets. Keep the
  // largest seen so toggling the menus never re-paginates the book.
  const [pageTop, setPageTop] = useState(insets.top);
  const [pageBottom, setPageBottom] = useState(insets.bottom);
  if (insets.top > pageTop) setPageTop(insets.top);
  if (insets.bottom > pageBottom) setPageBottom(insets.bottom);

  const contentInsets = useMemo(
    () => ({ top: pageTop + HEADER_H, bottom: Math.max(pageBottom, 8) + FOOTER_H }),
    [pageTop, pageBottom]
  );
  const settings = useMemo(() => webSettings(prefs, contentInsets, boosted), [prefs, contentInsets, boosted]);

  useEffect(() => {
    updateBook(book.id, { lastOpenedAt: Date.now() });
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // ---- Chrome show/hide animation
  const chromeAnim = useSharedValue(0);
  useEffect(() => {
    chromeAnim.value = withTiming(chrome ? 1 : 0, { duration: 200 });
  }, [chrome, chromeAnim]);
  const topStyle = useAnimatedStyle(() => ({
    opacity: chromeAnim.value,
    transform: [{ translateY: (1 - chromeAnim.value) * -16 }],
  }));
  const bottomStyle = useAnimatedStyle(() => ({
    opacity: chromeAnim.value,
    transform: [{ translateY: (1 - chromeAnim.value) * 16 }],
  }));
  const steadyDot = useAnimatedStyle(() => ({ opacity: 0.3 + 0.7 * Math.min(1, gimbal.appliedGain.value / 0.4) }));

  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 1800);
  }, []);

  // ---- Events from the renderer
  const onEvent = useCallback(
    (e: ReaderEvent) => {
      switch (e.t) {
        case 'loaded':
          setToc(e.toc);
          if (e.meta.title && book.titleFromFile) {
            updateBook(book.id, { title: e.meta.title, titleFromFile: false });
          }
          if (e.meta.author && !book.author) updateBook(book.id, { author: e.meta.author });
          break;
        case 'relocated': {
          setLoc(e);
          setError(null);
          const patch: Partial<Book> = { location: e.location, chapter: e.chapter ?? null };
          if (e.percent != null) patch.percent = e.percent;
          if (e.atEnd) {
            patch.finished = true;
            patch.percent = 1;
          }
          updateBook(book.id, patch);
          break;
        }
        case 'locations':
          try {
            const f = locationsFile(book.id);
            f.create({ overwrite: true });
            f.write(e.data);
            updateBook(book.id, { hasLocations: true });
          } catch {
            // Will just be recalculated next time.
          }
          break;
        case 'cover': {
          const name = book.coverName ? null : writeCoverDataUrl(book.id, e.dataUrl);
          updateBook(book.id, name ? { coverName: name, coverChecked: true } : { coverChecked: true });
          break;
        }
        case 'tap':
          setChrome((c) => !c);
          break;
        case 'error':
          if (!loc) setError(e.message);
          break;
      }
    },
    [book.id, book.titleFromFile, book.author, book.coverName, updateBook, loc]
  );

  const goto = (target: GotoTarget) => view.current?.goto(target);

  // ---- Bookmarks
  const bookmarked = !!loc && book.bookmarks.some((b) => b.location === loc.location);
  const toggleBookmark = () => {
    if (!loc) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (bookmarked) {
      updateBook(book.id, (b) => ({ bookmarks: b.bookmarks.filter((m) => m.location !== loc.location) }));
      showToast('Bookmark removed');
    } else {
      const label =
        book.kind === 'pdf' ? `Page ${loc.page}` : `${loc.chapter || 'Bookmark'}${loc.pageInChapter ? ` · page ${loc.pageInChapter}` : ''}`;
      updateBook(book.id, (b) => ({
        bookmarks: [...b.bookmarks, { id: newId(), location: loc.location, label, percent: loc.percent, createdAt: Date.now() }],
      }));
      showToast('Page bookmarked');
    }
  };

  const toggleSteady = () => {
    if (!sensorsAvailable) {
      showToast('Motion sensors unavailable');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const on = !prefs.gimbal;
    setPrefs({ gimbal: on });
    showToast(on ? 'Steady Mode on' : 'Steady Mode off');
  };

  // ---- Labels
  const percent = scrub ?? loc?.percent ?? null;
  const pctText = percent != null ? `${Math.round(percent * 100)}%` : '';
  let positionText = '';
  if (book.kind === 'pdf' && loc?.page) {
    positionText =
      scrub != null && loc.totalPages
        ? `Page ${Math.round(scrub * (loc.totalPages - 1)) + 1} of ${loc.totalPages}`
        : `Page ${loc.page} of ${loc.totalPages}`;
  } else if (loc?.pagesInChapter) {
    const left = loc.pagesInChapter - (loc.pageInChapter ?? 1);
    positionText = left <= 0 ? 'Last page in chapter' : `${left} ${left === 1 ? 'page' : 'pages'} left in chapter`;
  }
  const loading = !loc && !error;
  const footerColor = theme.muted;

  return (
    <View style={[styles.fill, { backgroundColor: theme.bg }]}>
      <StatusBar hidden={!chrome && !aaOpen && !tocOpen} style={theme.dark ? 'light' : 'dark'} animated />

      <SteadyView values={gimbal} style={{ backgroundColor: theme.bg }}>
        <BookView ref={view} book={book} settings={settings} onEvent={onEvent} />
      </SteadyView>
      {prefs.gimbal && (
        <GimbalDriver values={gimbal} strength={prefs.strength} leadMs={prefs.leadMs} onAvailability={setSensorsAvailable} />
      )}

      {/* Quiet header and footer while reading */}
      {!loading && !error && (
        <>
          <View pointerEvents="none" style={[styles.header, { top: pageTop + 6 }]}>
            <Text numberOfLines={1} style={[styles.headerText, { color: footerColor }]}>
              {book.kind === 'epub' ? loc?.chapter || book.title : book.title}
            </Text>
          </View>
          <View pointerEvents="none" style={[styles.footer, { bottom: Math.max(pageBottom, 8) + 4 }]}>
            <Text numberOfLines={1} style={[styles.footerText, { color: footerColor, flex: 1 }]}>
              {positionText}
            </Text>
            {prefs.gimbal && (
              <Animated.View style={[styles.footerSteady, steadyDot]}>
                <Ionicons name="scan-outline" size={12} color={theme.link} />
              </Animated.View>
            )}
            <Text style={[styles.footerText, { color: footerColor, flex: 1, textAlign: 'right' }]}>{pctText}</Text>
          </View>
        </>
      )}

      {/* While the menus are open, a tap on the page closes them instead of turning it. */}
      {chrome && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setChrome(false)}
          accessibilityRole="button"
          accessibilityLabel="Hide menus"
        />
      )}

      {/* Top chrome */}
      <Animated.View
        pointerEvents={chrome ? 'auto' : 'none'}
        style={[
          styles.topBar,
          { paddingTop: insets.top, backgroundColor: theme.chrome, borderColor: theme.chromeBorder },
          topStyle,
        ]}
      >
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to library">
            <Ionicons name="chevron-back" size={24} color={theme.fg} />
            <Text style={[styles.backText, { color: theme.fg }]}>Library</Text>
          </Pressable>
          <View style={styles.topIcons}>
            <IconBtn icon="list" label="Contents and bookmarks" color={theme.fg} onPress={() => setTocOpen(true)} />
            <IconBtn icon="text" label="Text and page settings" color={theme.fg} onPress={() => setAaOpen(true)} />
            <IconBtn
              icon={bookmarked ? 'bookmark' : 'bookmark-outline'}
              label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
              color={bookmarked ? theme.link : theme.fg}
              onPress={toggleBookmark}
            />
            <Pressable
              onPress={toggleSteady}
              style={[styles.steadyBtn, prefs.gimbal && { backgroundColor: theme.link }]}
              accessibilityRole="switch"
              accessibilityState={{ checked: prefs.gimbal }}
              accessibilityLabel="Steady Mode"
              hitSlop={6}
            >
              <Ionicons name="scan-outline" size={20} color={prefs.gimbal ? theme.bg : theme.fg} />
            </Pressable>
          </View>
        </View>
        <Text numberOfLines={1} style={[styles.topTitle, { color: theme.muted }]}>
          {book.title}
          {book.author ? ` · ${book.author}` : ''}
        </Text>
      </Animated.View>

      {/* Bottom chrome */}
      <Animated.View
        pointerEvents={chrome ? 'auto' : 'none'}
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.chrome, borderColor: theme.chromeBorder },
          bottomStyle,
        ]}
      >
        <Slider
          style={styles.slider}
          value={loc?.percent ?? 0}
          disabled={loc?.percent == null}
          minimumValue={0}
          maximumValue={1}
          minimumTrackTintColor={theme.link}
          maximumTrackTintColor={theme.chromeBorder}
          thumbTintColor={theme.dark ? theme.fg : '#FFFFFF'}
          onValueChange={setScrub}
          onSlidingComplete={(v) => {
            setScrub(null);
            goto({ percent: v });
          }}
          accessibilityLabel="Reading position"
        />
        <View style={styles.bottomRow}>
          <Text numberOfLines={1} style={[styles.bottomText, { color: theme.fg, flex: 1 }]}>
            {loc?.percent == null && book.kind === 'epub'
              ? 'Calculating pages…'
              : scrub != null
                ? `Go to ${pctText}`
                : positionText || (loc?.chapter ?? '')}
          </Text>
          <Text style={[styles.bottomText, { color: theme.muted }]}>{pctText}</Text>
        </View>
      </Animated.View>

      {prefs.gimbal && prefs.showSensorReadout && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + (chrome ? 92 : 30) }}>
          <SensorReadout values={gimbal} color={theme.fg} bg={theme.chrome} />
        </View>
      )}

      {toast && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(200)}
          pointerEvents="none"
          style={[styles.toast, { top: insets.top + (chrome ? 96 : 40), backgroundColor: theme.fg }]}
        >
          <Text style={[styles.toastText, { color: theme.bg }]}>{toast}</Text>
        </Animated.View>
      )}

      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.bg }]}>
          <ActivityIndicator color={theme.link} />
          <Text style={[styles.loadingText, { color: theme.muted }]}>Opening {book.title}…</Text>
          <Pressable onPress={() => router.back()} style={styles.loadingBack} accessibilityRole="button">
            <Text style={{ color: theme.link, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
      )}
      {error && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.bg, padding: 32 }]}>
          <Ionicons name="alert-circle-outline" size={40} color={theme.muted} />
          <Text style={[styles.errorTitle, { color: theme.fg }]}>This book couldn’t be opened</Text>
          <Text style={[styles.errorText, { color: theme.muted }]}>{error}</Text>
          <Pressable onPress={() => router.back()} style={[styles.errorBtn, { backgroundColor: theme.link }]} accessibilityRole="button">
            <Text style={{ color: theme.bg, fontWeight: '700' }}>Back to Library</Text>
          </Pressable>
        </View>
      )}

      <AaSheet
        visible={aaOpen}
        onClose={() => setAaOpen(false)}
        kind={book.kind}
        prefs={prefs}
        setPrefs={setPrefs}
        theme={theme}
        gimbal={gimbal}
        sensorsAvailable={sensorsAvailable}
      />
      <TocSheet
        visible={tocOpen}
        onClose={() => setTocOpen(false)}
        theme={theme}
        title={book.title}
        toc={toc}
        currentChapter={loc?.chapter ?? null}
        bookmarks={book.bookmarks}
        onGo={(t) => {
          goto(t);
          setChrome(false);
        }}
        onDeleteBookmark={(bid) => updateBook(book.id, (b) => ({ bookmarks: b.bookmarks.filter((m) => m.id !== bid) }))}
      />
    </View>
  );
}

function IconBtn({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.iconBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', left: 40, right: 40, alignItems: 'center' },
  headerText: { fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },
  footer: { position: 'absolute', left: 22, right: 22, flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerText: { fontSize: 12, fontVariant: ['tabular-nums'] },
  footerSteady: { width: 18, alignItems: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 46 },
  back: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  backText: { fontSize: 16 },
  topIcons: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  steadyBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  topTitle: { fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  slider: { width: '100%', height: 36 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingBottom: 4 },
  bottomText: { fontSize: 13, fontVariant: ['tabular-nums'] },
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  toastText: { fontSize: 13, fontWeight: '600' },
  loadingText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  loadingBack: { marginTop: 18, padding: 8 },
  errorTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  errorText: { fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  errorBtn: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
});

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLibrary } from '../library/LibraryContext';
import type { Book } from '../library/types';
import { BookCover } from '../ui/BookCover';
import { BottomTabs, type TabOption } from '../ui/BottomTabs';
import { ProgressBar } from '../ui/ProgressBar';
import { serif, useAppTheme, type AppTheme } from '../ui/theme';

type Filter = 'all' | 'reading' | 'unread' | 'finished';
const FILTERS: TabOption<Filter>[] = [
  { value: 'all', label: 'All', icon: 'library-outline', iconSelected: 'library' },
  { value: 'reading', label: 'Reading', icon: 'book-outline', iconSelected: 'book' },
  { value: 'unread', label: 'Unread', icon: 'sparkles-outline', iconSelected: 'sparkles' },
  { value: 'finished', label: 'Finished', icon: 'checkmark-circle-outline', iconSelected: 'checkmark-circle' },
];

const H_PAD = 20;
const GAP = 16;

function status(b: Book): 'unread' | 'reading' | 'finished' {
  if (b.finished) return 'finished';
  return b.lastOpenedAt ? 'reading' : 'unread';
}

function pctLabel(b: Book) {
  if (b.finished) return 'Finished';
  if (!b.lastOpenedAt) return 'New';
  return `${Math.round(b.percent * 100)}%`;
}

export default function LibraryScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { ready, books, importBooks, updateBook, removeBook } = useLibrary();
  const [filter, setFilter] = useState<Filter>('all');
  const [importing, setImporting] = useState(false);

  const columns = width >= 700 ? 5 : 3;
  const coverW = Math.floor((width - H_PAD * 2 - GAP * (columns - 1)) / columns);

  const continueBook = useMemo(
    () =>
      books
        .filter((b) => b.lastOpenedAt && !b.finished)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0],
    [books]
  );

  const booksFor = useMemo(() => {
    const sorted = [...books].sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
    return (f: Filter) => (f === 'all' ? sorted : sorted.filter((b) => status(b) === f));
  }, [books]);

  // ---- Tabs: a horizontal pager, one page per filter, kept in sync with the bottom bar.
  const pager = useRef<ScrollViewInstance>(null);
  const filterIndex = FILTERS.findIndex((f) => f.value === filter);

  const selectTab = (f: Filter) => {
    if (f === filter) return;
    Haptics.selectionAsync().catch(() => {});
    setFilter(f);
    pager.current?.scrollTo({ x: FILTERS.findIndex((x) => x.value === f) * width, animated: true });
  };

  const onPageSettled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    const next = FILTERS[i]?.value;
    if (!next || next === filter) return;
    Haptics.selectionAsync().catch(() => {});
    setFilter(next);
  };

  // Rotation changes the page width; keep the selected page in view.
  useEffect(() => {
    pager.current?.scrollTo({ x: filterIndex * width, animated: false });
    // Only when the width changes; tab changes scroll themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const open = (b: Book) => router.push({ pathname: '/reader/[id]', params: { id: b.id } });

  const onImport = async () => {
    setImporting(true);
    try {
      const res = await importBooks();
      if (res.added.length) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (res.failed.length) {
        Alert.alert(
          res.added.length ? 'Some files were skipped' : "Couldn't add that file",
          res.failed.map((f) => `• ${f.name}: ${f.reason}`).join('\n')
        );
      }
    } catch (e) {
      Alert.alert("Couldn't open the file picker", e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const onLongPress = (b: Book) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(b.title, b.author ?? undefined, [
      {
        text: b.finished ? 'Mark as unread' : 'Mark as finished',
        onPress: () =>
          updateBook(b.id, b.finished ? { finished: false } : { finished: true, percent: 1, lastOpenedAt: b.lastOpenedAt ?? Date.now() }),
      },
      {
        text: 'Remove from library',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Remove this book?', `"${b.title}" and its bookmarks will be deleted from this device.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => removeBook(b.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const s = makeStyles(theme);

  const topBar = (
    <View style={[s.topRow, { paddingTop: insets.top + 8 }]}>
      <View>
        <Text style={s.largeTitle}>Library</Text>
        <Text style={s.subtitle}>
          {books.length} {books.length === 1 ? 'book' : 'books'}
        </Text>
      </View>
      <View style={s.topActions}>
        <Pressable
          onPress={() => router.push('/settings')}
          style={s.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={theme.text} />
        </Pressable>
        <Pressable
          onPress={onImport}
          disabled={importing}
          style={[s.addBtn, { backgroundColor: theme.accent }]}
          accessibilityRole="button"
          accessibilityLabel="Add books"
        >
          {importing ? (
            <ActivityIndicator color={theme.accentText} />
          ) : (
            <Ionicons name="add" size={26} color={theme.accentText} />
          )}
        </Pressable>
      </View>
    </View>
  );

  const allHeader = (
    <View>
      {continueBook && (
        <Pressable
          onPress={() => open(continueBook)}
          onLongPress={() => onLongPress(continueBook)}
          style={({ pressed }) => [s.continueCard, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={`Continue reading ${continueBook.title}, ${pctLabel(continueBook)}`}
        >
          <BookCover book={continueBook} width={84} style={s.shadow} />
          <View style={s.continueBody}>
            <Text style={s.eyebrow}>CONTINUE READING</Text>
            <Text style={s.continueTitle} numberOfLines={2}>
              {continueBook.title}
            </Text>
            {!!continueBook.chapter && (
              <Text style={s.continueMeta} numberOfLines={1}>
                {continueBook.chapter}
              </Text>
            )}
            <View style={s.continueProgress}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={continueBook.percent} color={theme.accent} track={theme.border} height={4} />
              </View>
              <Text style={s.continuePct}>{Math.round(continueBook.percent * 100)}%</Text>
            </View>
            <View style={[s.resume, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="book-outline" size={14} color={theme.accent} />
              <Text style={[s.resumeText, { color: theme.accent }]}>Resume</Text>
            </View>
          </View>
        </Pressable>
      )}
    </View>
  );

  if (!ready) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const renderPage = (f: Filter) => (
    <FlatList
      data={booksFor(f)}
      key={`${f}-${columns}`}
      numColumns={columns}
      keyExtractor={(b) => b.id}
      ListHeaderComponent={f === 'all' ? allHeader : undefined}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
      columnWrapperStyle={{ gap: GAP, paddingHorizontal: H_PAD }}
      ItemSeparatorComponent={() => <View style={{ height: 22 }} />}
      ListEmptyComponent={
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name={FILTERS.find((x) => x.value === f)?.icon ?? 'library-outline'} size={34} color={theme.accent} />
          </View>
          <Text style={s.emptyTitle}>{EMPTY_TITLES[f]}</Text>
          <Text style={s.emptyText}>
            {f === 'all'
              ? 'Add EPUB or PDF books from your phone, iCloud Drive, Google Drive or Downloads.'
              : 'Books show up here as you read them.'}
          </Text>
          {f === 'all' && (
            <Pressable onPress={onImport} style={[s.emptyBtn, { backgroundColor: theme.accent }]} accessibilityRole="button">
              <Ionicons name="add" size={18} color={theme.accentText} />
              <Text style={[s.emptyBtnText, { color: theme.accentText }]}>Add books</Text>
            </Pressable>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => open(item)}
          onLongPress={() => onLongPress(item)}
          delayLongPress={350}
          style={({ pressed }) => [{ width: coverW }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}${item.author ? ` by ${item.author}` : ''}, ${pctLabel(item)}`}
          accessibilityHint="Opens the book. Long press for more options."
        >
          <BookCover book={item} width={coverW} style={s.shadow} />
          <Text style={s.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.lastOpenedAt && !item.finished ? (
            <View style={s.cardProgress}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={item.percent} color={theme.accent} track={theme.border} />
              </View>
              <Text style={s.cardPct}>{pctLabel(item)}</Text>
            </View>
          ) : (
            <View style={s.cardProgress}>
              <View
                style={[
                  s.tag,
                  { backgroundColor: item.finished ? theme.surfaceAlt : theme.accentSoft },
                ]}
              >
                {item.finished && <Ionicons name="checkmark" size={11} color={theme.textMuted} />}
                <Text style={[s.tagText, { color: item.finished ? theme.textMuted : theme.accent }]}>
                  {pctLabel(item).toUpperCase()}
                </Text>
              </View>
              {item.kind === 'pdf' && <Text style={s.kind}>PDF</Text>}
            </View>
          )}
        </Pressable>
      )}
    />
  );

  return (
    <View style={s.root}>
      {topBar}
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPageSettled}
        style={{ flex: 1 }}
        accessibilityLabel="Book lists. Swipe left or right to change list."
      >
        {FILTERS.map((f) => (
          <View key={f.value} style={{ width }}>
            {renderPage(f.value)}
          </View>
        ))}
      </ScrollView>
      <BottomTabs options={FILTERS} value={filter} onChange={selectTab} theme={theme} />
    </View>
  );
}

const EMPTY_TITLES: Record<Filter, string> = {
  all: 'Your library is empty',
  reading: 'Nothing in progress',
  unread: 'No unread books',
  finished: 'No finished books yet',
};

const makeStyles = (t: AppTheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: H_PAD,
      paddingBottom: 14,
    },
    largeTitle: { fontSize: 34, fontWeight: '800', color: t.text, fontFamily: serif, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: t.textMuted, marginTop: 2 },
    topActions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
    iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    shadow: {
      shadowColor: t.shadow,
      shadowOpacity: t.dark ? 0.5 : 0.22,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    continueCard: {
      flexDirection: 'row',
      gap: 16,
      marginHorizontal: H_PAD,
      marginBottom: 18,
      padding: 16,
      borderRadius: 18,
      backgroundColor: t.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    continueBody: { flex: 1, justifyContent: 'center' },
    eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: t.accent, marginBottom: 4 },
    continueTitle: { fontSize: 18, fontWeight: '700', color: t.text, fontFamily: serif },
    continueMeta: { fontSize: 13, color: t.textMuted, marginTop: 3 },
    continueProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    continuePct: { fontSize: 12, color: t.textMuted, minWidth: 34, textAlign: 'right' },
    resume: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    resumeText: { fontSize: 13, fontWeight: '700' },
    cardTitle: { fontSize: 13, fontWeight: '600', color: t.text, marginTop: 8, lineHeight: 17 },
    cardProgress: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, minHeight: 16 },
    cardPct: { fontSize: 11, color: t.textMuted },
    tag: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    kind: { fontSize: 10, fontWeight: '700', color: t.textFaint, letterSpacing: 0.5 },
    empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 40 },
    emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: t.text, fontFamily: serif },
    emptyText: { fontSize: 15, color: t.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 20,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 999,
    },
    emptyBtnText: { fontSize: 16, fontWeight: '700' },
  });

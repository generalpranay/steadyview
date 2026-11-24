import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Bookmark } from '../library/types';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import type { GotoTarget, TocItem } from './BookView';
import type { PageTheme } from './themes';

interface Props {
  visible: boolean;
  onClose: () => void;
  theme: PageTheme;
  title: string;
  toc: TocItem[];
  currentChapter: string | null;
  bookmarks: Bookmark[];
  onGo: (target: GotoTarget) => void;
  onDeleteBookmark: (id: string) => void;
}

export function TocSheet({ visible, onClose, theme: t, title, toc, currentChapter, bookmarks, onGo, onDeleteBookmark }: Props) {
  const [tab, setTab] = useState<'contents' | 'bookmarks'>('contents');
  const seg = {
    track: t.dark ? '#00000033' : '#00000008',
    border: t.chromeBorder,
    selected: t.dark ? t.fg : '#FFFFFF',
    selectedText: t.dark ? t.bg : t.fg,
    text: t.muted,
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title} bg={t.chrome} fg={t.fg} border={t.chromeBorder} maxHeightRatio={0.85}>
      <Segmented
        options={[
          { value: 'contents', label: 'Contents' },
          { value: 'bookmarks', label: `Bookmarks${bookmarks.length ? ` (${bookmarks.length})` : ''}` },
        ]}
        value={tab}
        onChange={setTab}
        colors={seg}
        accessibilityLabel="Contents or bookmarks"
        style={{ marginBottom: 8 }}
      />
      {tab === 'contents' ? (
        <FlatList
          data={toc}
          keyExtractor={(_, i) => String(i)}
          style={{ flexGrow: 0 }}
          ListEmptyComponent={<Empty theme={t} icon="list" text="This book has no table of contents." />}
          renderItem={({ item }) => {
            const current = !!currentChapter && item.label === currentChapter;
            return (
              <Pressable
                onPress={() => {
                  onGo(item.target);
                  onClose();
                }}
                style={({ pressed }) => [styles.item, { borderColor: t.chromeBorder }, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.itemText,
                    { color: current ? t.link : t.fg, paddingLeft: item.depth * 16 },
                    current && { fontWeight: '700' },
                    item.depth > 0 && { fontSize: 15 },
                  ]}
                  numberOfLines={2}
                >
                  {item.label || 'Untitled section'}
                </Text>
                {typeof item.target.page === 'number' && (
                  <Text style={[styles.page, { color: t.muted }]}>{item.target.page}</Text>
                )}
                {current && <View style={[styles.dot, { backgroundColor: t.link }]} />}
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={[...bookmarks].sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))}
          keyExtractor={(b) => b.id}
          style={{ flexGrow: 0 }}
          ListEmptyComponent={
            <Empty theme={t} icon="bookmark-outline" text="Tap the ribbon at the top of a page to bookmark it." />
          }
          renderItem={({ item }) => (
            <View style={[styles.item, { borderColor: t.chromeBorder }]}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => {
                  onGo(/^\d+$/.test(item.location) ? { page: Number(item.location) } : { cfi: item.location });
                  onClose();
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.itemText, { color: t.fg }]} numberOfLines={2}>
                  {item.label}
                </Text>
                <Text style={[styles.sub, { color: t.muted }]}>
                  {item.percent != null ? `${Math.round(item.percent * 100)}% · ` : ''}
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onDeleteBookmark(item.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Delete bookmark"
              >
                <Ionicons name="trash-outline" size={19} color={t.muted} />
              </Pressable>
            </View>
          )}
        />
      )}
    </Sheet>
  );
}

function Empty({ theme, icon, text }: { theme: PageTheme; icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={28} color={theme.muted} />
      <Text style={[styles.emptyText, { color: theme.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: { flex: 1, fontSize: 16 },
  sub: { fontSize: 12, marginTop: 3 },
  page: { fontSize: 13, fontVariant: ['tabular-nums'] },
  dot: { width: 7, height: 7, borderRadius: 4 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 30 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});

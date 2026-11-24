import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { coverUri } from '../library/files';
import type { Book } from '../library/types';
import { serif } from './theme';

/** Muted, bookish cover colours for books without cover art. */
const PALETTE = [
  ['#2F4858', '#D7E3E8'],
  ['#6B3E26', '#F2DFCF'],
  ['#3D5A40', '#DCE8D5'],
  ['#5B3758', '#EADCE8'],
  ['#7A5C1E', '#F4E8C8'],
  ['#2E3A6B', '#D8DCF0'],
  ['#8C3B3B', '#F3D9D6'],
  ['#355C5A', '#D3E8E6'],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface Props {
  book: Book;
  width: number;
  style?: StyleProp<ViewStyle>;
}

export function BookCover({ book, width, style }: Props) {
  const height = Math.round(width * 1.5);
  const uri = coverUri(book);
  const radius = Math.max(3, Math.round(width * 0.03));
  const frame = [styles.frame, { width, height, borderRadius: radius }, style];

  if (uri) {
    return (
      <View style={frame}>
        <Image source={{ uri }} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} resizeMode="cover" />
        <View style={[styles.spine, { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }]} />
      </View>
    );
  }

  if (book.builtIn) {
    return (
      <View style={[frame, { backgroundColor: '#0F6E56', padding: width * 0.08 }]}>
        <View style={[styles.inner, { borderColor: '#9FE1CB55' }]}>
          <Ionicons name="scan-outline" size={width * 0.34} color="#E1F5EE" />
          <Text style={[styles.title, { color: '#FFFFFF', fontSize: Math.max(7, width * 0.09), marginTop: width * 0.06 }]}>
            Welcome to
          </Text>
          <Text
            style={[styles.title, styles.bold, { color: '#FFFFFF', fontSize: Math.max(8, width * 0.105) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            SteadyView
          </Text>
        </View>
      </View>
    );
  }

  const [bg, fg] = PALETTE[hash(book.title) % PALETTE.length];
  const small = width < 90;
  return (
    <View style={[frame, { backgroundColor: bg, padding: width * 0.08 }]}>
      <View style={[styles.inner, styles.innerTop, { borderColor: fg + '55' }]}>
        <Text
          style={[styles.title, styles.bold, { color: fg, fontSize: Math.max(9, width * (small ? 0.12 : 0.11)) }]}
          numberOfLines={small ? 4 : 5}
        >
          {book.title}
        </Text>
        {!!book.author && !small && (
          <Text style={[styles.title, { color: fg, opacity: 0.8, fontSize: Math.max(8, width * 0.075) }]} numberOfLines={2}>
            {book.author}
          </Text>
        )}
      </View>
      {book.kind === 'pdf' && (
        <View style={[styles.badge, { backgroundColor: fg }]}>
          <Text style={[styles.badgeText, { color: bg }]}>PDF</Text>
        </View>
      )}
      <View style={[styles.spine, { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: '#ddd',
  },
  inner: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  innerTop: { justifyContent: 'flex-start', paddingTop: '18%', gap: 6 },
  title: { fontFamily: serif, textAlign: 'center' },
  bold: { fontWeight: '700' },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  badge: { position: 'absolute', right: 6, bottom: 6, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
});

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type ComponentType, type Ref } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { bookFile, locationsFile } from '../library/files';
import type { Book } from '../library/types';
import { isLocalUrl, parseReaderMessage } from './readerMessages';
import type { WebSettings } from './themes';
import { EPUB_HTML } from './web/epubHtml.generated';
import { PDF_HTML } from './web/pdfHtml.generated';

export interface TocItem {
  label: string;
  target: { href?: string; page?: number };
  depth: number;
}

export interface Relocated {
  location: string;
  percent: number | null;
  chapter?: string;
  pageInChapter?: number;
  pagesInChapter?: number;
  page?: number;
  totalPages?: number;
  atStart?: boolean;
  atEnd?: boolean;
}

export type ReaderEvent =
  | { t: 'loaded'; kind: 'epub' | 'pdf'; toc: TocItem[]; totalPages?: number; meta: { title: string | null; author: string | null } }
  | ({ t: 'relocated' } & Relocated)
  | { t: 'locations'; data: string }
  | { t: 'cover'; dataUrl: string }
  | { t: 'tap' }
  | { t: 'error'; message: string };

export type GotoTarget = { href?: string; cfi?: string; page?: number; percent?: number };

export interface BookViewHandle {
  goto: (target: GotoTarget) => void;
  next: () => void;
  prev: () => void;
}

interface Props {
  book: Book;
  settings: WebSettings;
  onEvent: (e: ReaderEvent) => void;
}

const CHUNK = 256 * 1024;

function allowOnlyLocalLoads({ url }: { url: string }): boolean {
  if (isLocalUrl(url)) return true;
  if (__DEV__) console.warn('[reader] blocked a load outside the book:', url.slice(0, 200));
  return false;
}

// react-native-webview 14's class typings collapse to `never` under TypeScript 6
// (props intersected with `undefined`), so use a typed alias of the same component.
type WebViewRef = WebView<object>;
const Web = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewRef> }>;

/** Hosts the offline EPUB / PDF renderer and talks to it over a small message protocol. */
export const BookView = forwardRef<BookViewHandle, Props>(function BookView({ book, settings, onEvent }, ref) {
  const web = useRef<WebViewRef>(null);
  const opened = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  // Latest saved position, so a reload re-opens where the reader actually is.
  const bookRef = useRef(book);
  bookRef.current = book;

  const send = useCallback((msg: object) => {
    web.current?.injectJavaScript(`window.SV&&window.SV.receive(${JSON.stringify(msg)});true;`);
  }, []);

  useImperativeHandle(ref, () => ({
    goto: (target) => send({ t: 'goto', target }),
    next: () => send({ t: 'next' }),
    prev: () => send({ t: 'prev' }),
  }));

  const openBook = useCallback(async () => {
    const book = bookRef.current;
    try {
      const data = await bookFile(book).base64();
      for (let i = 0; i < data.length; i += CHUNK) send({ t: 'chunk', data: data.slice(i, i + CHUNK) });
      let locations: string | null = null;
      if (book.kind === 'epub' && book.hasLocations) {
        const lf = locationsFile(book.id);
        if (lf.exists) locations = await lf.text();
      }
      send({
        t: 'open',
        settings: settingsRef.current,
        location: book.location,
        locations,
        needCover: !book.coverChecked,
      });
      opened.current = true;
    } catch (e) {
      onEventRef.current({ t: 'error', message: e instanceof Error ? e.message : 'Could not read the book file' });
    }
  }, [send]);

  // Push settings changes after the book is open.
  useEffect(() => {
    if (opened.current) send({ t: 'settings', settings });
  }, [settings, send]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const msg = parseReaderMessage(e.nativeEvent.data);
      if (!msg) {
        if (__DEV__) console.warn('[reader] ignored an unexpected message from the WebView', e.nativeEvent.data.slice(0, 200));
        return;
      }
      if (msg.t === 'ready') {
        opened.current = false;
        openBook();
        return;
      }
      onEventRef.current(msg);
    },
    [openBook]
  );

  return (
    <Web
      ref={web}
      source={{ html: book.kind === 'epub' ? EPUB_HTML : PDF_HTML }}
      originWhitelist={['*']}
      // Books stay offline: never navigate the reader (or a book frame) to a real URL.
      onShouldStartLoadWithRequest={allowOnlyLocalLoads}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={book.kind === 'pdf'}
      bounces={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      setBuiltInZoomControls={book.kind === 'pdf'}
      setDisplayZoomControls={false}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      allowsLinkPreview={false}
      textInteractionEnabled={false}
      decelerationRate="normal"
      webviewDebuggingEnabled={__DEV__}
      // iOS can kill the web process under memory pressure; reload re-opens at the saved spot.
      onContentProcessDidTerminate={() => web.current?.reload()}
      onRenderProcessGone={() => web.current?.reload()}
      style={[styles.web, { backgroundColor: settings.bg }]}
      containerStyle={{ backgroundColor: settings.bg }}
      {...(Platform.OS === 'android' ? { androidLayerType: 'hardware' as const } : null)}
    />
  );
});

const styles = StyleSheet.create({ web: { flex: 1 } });

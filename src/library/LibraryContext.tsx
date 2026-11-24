import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { deleteBookFiles } from './files';
import { createGuideBook, pickAndImportBooks, type ImportResult } from './importBooks';
import { parseBooks, parsePrefs } from './storage';
import { DEFAULT_PREFS, type Book, type Prefs } from './types';

const BOOKS_KEY = 'sv.books.v1';
const PREFS_KEY = 'sv.prefs.v1';
const SEEDED_KEY = 'sv.seeded.v1';
const SAVE_DELAY_MS = 400;

/** Reads the saved library. Unreadable data is kept under a backup key, never silently dropped. */
async function loadBooks(): Promise<Book[]> {
  const raw = await AsyncStorage.getItem(BOOKS_KEY);
  const parsed = parseBooks(raw);
  if (!parsed.ok) {
    const backupKey = `${BOOKS_KEY}.corrupt.${Date.now()}`;
    console.warn(`[library] ${parsed.reason}; starting empty and keeping the old data under ${backupKey}`);
    await AsyncStorage.setItem(backupKey, raw ?? '').catch(() => {});
    return [];
  }
  if (parsed.dropped) console.warn(`[library] skipped ${parsed.dropped} unreadable book entries`);
  return parsed.books;
}

const saveBooks = (books: Book[]) =>
  AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(books)).catch((e: unknown) => {
    console.warn('[library] could not save the library', e);
  });

type Patch = Partial<Book> | ((b: Book) => Partial<Book>);

interface LibraryValue {
  ready: boolean;
  books: Book[];
  prefs: Prefs;
  getBook: (id: string) => Book | undefined;
  importBooks: () => Promise<ImportResult>;
  updateBook: (id: string, patch: Patch) => void;
  removeBook: (id: string) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
}

const LibraryContext = createContext<LibraryValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);

  // Load once, and seed the welcome guide on first launch.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [loadedBooks, rawPrefs, seeded] = await Promise.all([
        loadBooks(),
        AsyncStorage.getItem(PREFS_KEY),
        AsyncStorage.getItem(SEEDED_KEY),
      ]);
      let loaded = loadedBooks;
      if (!seeded) {
        try {
          loaded = [await createGuideBook(), ...loaded];
          // Save the guide before marking it seeded, so a quit right now can't orphan its file.
          await AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(loaded));
          await AsyncStorage.setItem(SEEDED_KEY, '1');
        } catch (e) {
          console.warn('[library] could not create the welcome guide; it will be retried next launch', e);
        }
      }
      if (!alive) return;
      setBooks(loaded);
      setPrefsState(parsePrefs(rawPrefs));
      setReady(true);
    })().catch((e: unknown) => {
      console.warn('[library] could not load the library', e);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Debounced persistence (progress updates arrive on every page turn).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      saveBooks(books);
    }, SAVE_DELAY_MS);
  }, [books, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefs, ready]);

  const booksRef = useRef(books);
  booksRef.current = books;

  // Leaving the app may be the last chance to save: write a pending change now,
  // or the last page turned before closing the app would be lost.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || !saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      saveBooks(booksRef.current);
    });
    return () => sub.remove();
  }, []);

  const getBook = useCallback((id: string) => booksRef.current.find((b) => b.id === id), []);

  const updateBook = useCallback((id: string, patch: Patch) => {
    setBooks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...(typeof patch === 'function' ? patch(b) : patch) } : b))
    );
  }, []);

  const removeBook = useCallback((id: string) => {
    const book = booksRef.current.find((b) => b.id === id);
    if (book) deleteBookFiles(book);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const importBooks = useCallback(async () => {
    const result = await pickAndImportBooks();
    if (result.added.length) setBooks((prev) => [...result.added, ...prev]);
    return result;
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => ({ ...p, ...patch }));
  }, []);

  const value = useMemo(
    () => ({ ready, books, prefs, getBook, importBooks, updateBook, removeBook, setPrefs }),
    [ready, books, prefs, getBook, importBooks, updateBook, removeBook, setPrefs]
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const v = useContext(LibraryContext);
  if (!v) throw new Error('useLibrary must be used inside LibraryProvider');
  return v;
}

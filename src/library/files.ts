import { Directory, File, Paths } from 'expo-file-system';

import type { Book } from './types';

/**
 * All book data lives under the app's document folder. We store file NAMES in
 * the library and resolve full paths at runtime, because the absolute path of
 * the app container can change between app updates on iOS.
 */
function dir(name: string): Directory {
  const d = new Directory(Paths.document, name);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

export const booksDir = () => dir('books');
export const coversDir = () => dir('covers');

export const bookFile = (book: Pick<Book, 'fileName'>) => new File(booksDir(), book.fileName);
export const locationsFile = (id: string) => new File(booksDir(), `${id}.locations.json`);
export const coverUri = (book: Pick<Book, 'coverName'>) =>
  book.coverName ? new File(coversDir(), book.coverName).uri : null;

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** Saves a cover image; returns its file name, or null for unsupported types (e.g. SVG). */
export function writeCover(id: string, base64: string, mime: string): string | null {
  const ext = MIME_EXT[mime.toLowerCase()];
  if (!ext) return null;
  const name = `${id}-${Date.now().toString(36)}.${ext}`;
  const f = new File(coversDir(), name);
  f.create({ overwrite: true });
  f.write(base64, { encoding: 'base64' });
  return name;
}

/** Saves a cover from a data: URL posted by the reader. */
export function writeCoverDataUrl(id: string, dataUrl: string): string | null {
  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  return m ? writeCover(id, m[2], m[1]) : null;
}

export function safeDelete(f: File) {
  try {
    if (f.exists) f.delete();
  } catch {
    // Best effort: a leftover file is harmless.
  }
}

export function deleteBookFiles(book: Book) {
  safeDelete(bookFile(book));
  safeDelete(locationsFile(book.id));
  if (book.coverName) safeDelete(new File(coversDir(), book.coverName));
}

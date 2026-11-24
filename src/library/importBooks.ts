import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { readEpubMeta } from './epubMeta';
import { booksDir, newId, safeDelete, writeCover } from './files';
import { buildGuideEpub, GUIDE_AUTHOR, GUIDE_TITLE } from './guideBook';
import type { Book, BookKind } from './types';

/**
 * The reader holds the whole book in memory (as base64, inside the WebView), so
 * very large files can crash the app. Reject them up front with a clear reason.
 */
export const MAX_BOOK_BYTES = 100 * 1024 * 1024;
const TOO_BIG = 'This file is larger than 100 MB, which is too big to open safely on a phone';

export interface ImportResult {
  added: Book[];
  failed: { name: string; reason: string }[];
  canceled: boolean;
}

/** "the_long_way-home (2019).epub" → "The long way home (2019)" */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' – ').trim();
  const t = base.replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Untitled';
}

export function kindOf(name: string, mime?: string | null): BookKind | null {
  const n = name.toLowerCase();
  if (n.endsWith('.epub') || mime === 'application/epub+zip') return 'epub';
  if (n.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  return null;
}

function newBook(id: string, kind: BookKind, fileName: string, title: string): Book {
  return {
    id,
    kind,
    title,
    author: null,
    fileName,
    coverName: null,
    titleFromFile: true,
    coverChecked: false,
    hasLocations: false,
    addedAt: Date.now(),
    lastOpenedAt: null,
    location: null,
    percent: 0,
    chapter: null,
    finished: false,
    bookmarks: [],
  };
}

async function importOne(asset: DocumentPicker.DocumentPickerAsset): Promise<Book> {
  const kind = kindOf(asset.name, asset.mimeType);
  if (!kind) throw new Error('Only EPUB and PDF files are supported');

  if (asset.size != null && asset.size > MAX_BOOK_BYTES) throw new Error(TOO_BIG);

  const id = newId();
  const fileName = `${id}.${kind}`;
  const dest = new File(booksDir(), fileName);
  try {
    await new File(asset.uri).copy(dest);
    if ((dest.size ?? 0) > MAX_BOOK_BYTES) throw new Error(TOO_BIG);
    const book = newBook(id, kind, fileName, titleFromFileName(asset.name));

    if (kind === 'epub') {
      // Read title/author/cover now so the library looks right immediately.
      try {
        const meta = await readEpubMeta(await dest.base64());
        if (meta.title) {
          book.title = meta.title;
          book.titleFromFile = false;
        }
        book.author = meta.author;
        if (meta.cover) {
          book.coverName = writeCover(id, meta.cover.base64, meta.cover.mime);
          book.coverChecked = true;
        }
      } catch {
        throw new Error("This EPUB looks damaged and can't be opened");
      }
    }
    return book;
  } catch (e) {
    safeDelete(dest);
    throw e;
  } finally {
    deletePickerCopy(asset.uri);
  }
}

/** The picker copies each file into the cache; ours is in the books folder now. */
function deletePickerCopy(uri: string) {
  if (uri.startsWith(Paths.cache.uri)) safeDelete(new File(uri));
}

/** Opens the system file picker and copies the chosen books into the app. */
export async function pickAndImportBooks(): Promise<ImportResult> {
  const res = await DocumentPicker.getDocumentAsync({
    // Some Android file managers label EPUBs as octet-stream; we check the extension after picking.
    type:
      Platform.OS === 'ios'
        ? ['application/epub+zip', 'application/pdf']
        : ['application/epub+zip', 'application/pdf', 'application/octet-stream'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (res.canceled) return { added: [], failed: [], canceled: true };

  const added: Book[] = [];
  const failed: ImportResult['failed'] = [];
  for (const asset of res.assets) {
    try {
      added.push(await importOne(asset));
    } catch (e) {
      failed.push({ name: asset.name, reason: e instanceof Error ? e.message : 'Unknown error' });
    }
  }
  return { added, failed, canceled: false };
}

/** Creates the built-in welcome guide. */
export async function createGuideBook(): Promise<Book> {
  const id = newId();
  const fileName = `${id}.epub`;
  const f = new File(booksDir(), fileName);
  f.create({ overwrite: true });
  f.write(await buildGuideEpub(), { encoding: 'base64' });
  return {
    ...newBook(id, 'epub', fileName, GUIDE_TITLE),
    author: GUIDE_AUTHOR,
    titleFromFile: false,
    coverChecked: true,
    builtIn: true,
  };
}

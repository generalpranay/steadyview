import type { ReaderEvent, TocItem } from './BookView';

/*
 * Checks every message posted by the reader WebView before the app acts on it.
 * Messages lead to file writes (locations, covers) and library updates, so a
 * malformed or unexpected one is dropped instead of trusted.
 */

const MAX_LOCATIONS_CHARS = 5_000_000;
const MAX_COVER_CHARS = 15_000_000;
const MAX_TEXT_CHARS = 500;

export type ReaderMessage = ReaderEvent | { t: 'ready' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown) => (isNum(v) ? v : undefined);
const optText = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT_CHARS) : undefined);
const textOrNull = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT_CHARS) : null);

function toTocItem(v: unknown): TocItem | null {
  if (!isObject(v) || typeof v.label !== 'string' || !isObject(v.target)) return null;
  const href = typeof v.target.href === 'string' ? v.target.href : undefined;
  const page = isNum(v.target.page) ? v.target.page : undefined;
  if (href === undefined && page === undefined) return null;
  return { label: v.label.slice(0, MAX_TEXT_CHARS), target: { href, page }, depth: isNum(v.depth) ? v.depth : 0 };
}

/** The message as a typed event, or null if it isn't one the app understands. */
export function parseReaderMessage(data: string): ReaderMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(m)) return null;
  switch (m.t) {
    case 'ready':
    case 'tap':
      return { t: m.t };
    case 'error':
      return { t: 'error', message: optText(m.message) ?? 'Unknown reader error' };
    case 'locations':
      return typeof m.data === 'string' && m.data.length <= MAX_LOCATIONS_CHARS ? { t: 'locations', data: m.data } : null;
    case 'cover':
      return typeof m.dataUrl === 'string' && m.dataUrl.startsWith('data:image/') && m.dataUrl.length <= MAX_COVER_CHARS
        ? { t: 'cover', dataUrl: m.dataUrl }
        : null;
    case 'relocated': {
      if (typeof m.location !== 'string') return null;
      const percent = isNum(m.percent) ? Math.min(1, Math.max(0, m.percent)) : null;
      return {
        t: 'relocated',
        location: m.location,
        percent,
        chapter: optText(m.chapter),
        pageInChapter: optNum(m.pageInChapter),
        pagesInChapter: optNum(m.pagesInChapter),
        page: optNum(m.page),
        totalPages: optNum(m.totalPages),
        atStart: m.atStart === true,
        atEnd: m.atEnd === true,
      };
    }
    case 'loaded': {
      if (m.kind !== 'epub' && m.kind !== 'pdf') return null;
      const toc = Array.isArray(m.toc) ? m.toc.map(toTocItem).filter((x): x is TocItem => x !== null) : [];
      const meta = isObject(m.meta) ? m.meta : {};
      return {
        t: 'loaded',
        kind: m.kind,
        toc,
        totalPages: optNum(m.totalPages),
        meta: { title: textOrNull(meta.title), author: textOrNull(meta.author) },
      };
    }
    default:
      return null;
  }
}

/** The reader only ever needs its own page and the book's in-memory resources. */
export function isLocalUrl(url: string): boolean {
  return /^(about:|data:|blob:)/i.test(url);
}

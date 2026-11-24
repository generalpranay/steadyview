import { FONT_STEPS } from '../reader/themes';
import type { Strength } from '../steadyview';
import { DEFAULT_PREFS, type Book, type Bookmark, type FontFamily, type Margins, type Prefs, type Spacing, type ThemeName } from './types';

/*
 * Validation for what we read back from AsyncStorage. Saved data can be
 * corrupted (crash mid-write, a bad app version, a restored backup), and file
 * names from it are used to build file paths, so nothing is trusted as-is.
 */

const BOOK_FILE = /^[a-z0-9]+\.(epub|pdf)$/i;
const COVER_FILE = /^[a-z0-9-]+\.(jpg|png|gif|webp)$/i;

export type ParsedBooks = { ok: true; books: Book[]; dropped: number } | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string | null) => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function toBookmark(v: unknown): Bookmark | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.location !== 'string') return null;
  const percent = num(v.percent, null);
  return {
    id: v.id,
    location: v.location,
    label: str(v.label, 'Bookmark') ?? 'Bookmark',
    percent: percent == null ? null : clamp01(percent),
    createdAt: num(v.createdAt, 0) ?? 0,
  };
}

/** A safe Book, or null when the entry can't be used (bad id, kind or file name). */
export function toBook(v: unknown): Book | null {
  if (!isObject(v)) return null;
  const { id, kind, fileName } = v;
  if (typeof id !== 'string' || !/^[a-z0-9]+$/i.test(id)) return null;
  if (kind !== 'epub' && kind !== 'pdf') return null;
  if (typeof fileName !== 'string' || !BOOK_FILE.test(fileName)) return null;
  const coverName = typeof v.coverName === 'string' && COVER_FILE.test(v.coverName) ? v.coverName : null;
  const bookmarks = Array.isArray(v.bookmarks) ? v.bookmarks.map(toBookmark).filter((b): b is Bookmark => b !== null) : [];
  return {
    id,
    kind,
    fileName,
    title: str(v.title, 'Untitled') || 'Untitled',
    author: str(v.author, null),
    coverName,
    titleFromFile: v.titleFromFile === true,
    coverChecked: v.coverChecked === true,
    hasLocations: v.hasLocations === true,
    addedAt: num(v.addedAt, 0) ?? 0,
    lastOpenedAt: num(v.lastOpenedAt, null),
    location: str(v.location, null),
    percent: clamp01(num(v.percent, 0) ?? 0),
    chapter: str(v.chapter, null),
    finished: v.finished === true,
    bookmarks,
    ...(v.builtIn === true ? { builtIn: true } : null),
  };
}

/** Parses the saved library. A missing value is an empty library, not an error. */
export function parseBooks(raw: string | null): ParsedBooks {
  if (raw == null) return { ok: true, books: [], dropped: 0 };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'saved library is not valid JSON' };
  }
  if (!Array.isArray(data)) return { ok: false, reason: 'saved library is not a list' };
  const books = data.map(toBook).filter((b): b is Book => b !== null);
  return { ok: true, books, dropped: data.length - books.length };
}

const THEMES: ThemeName[] = ['paper', 'sepia', 'dusk', 'night'];
const FONTS: FontFamily[] = ['original', 'serif', 'sans', 'rounded'];
const SPACINGS: Spacing[] = ['compact', 'normal', 'relaxed'];
const MARGINS: Margins[] = ['narrow', 'normal', 'wide'];
const STRENGTHS: Strength[] = ['gentle', 'balanced', 'strong'];
const MAX_LEAD_MS = 50;

function oneOf<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Saved preferences, with every unknown or out-of-range value replaced by its default. */
export function parsePrefs(raw: string | null): Prefs {
  if (raw == null) return DEFAULT_PREFS;
  let p: unknown;
  try {
    p = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFS;
  }
  if (!isObject(p)) return DEFAULT_PREFS;
  const d = DEFAULT_PREFS;
  const fontStep = num(p.fontStep, d.fontStep) ?? d.fontStep;
  const leadMs = num(p.leadMs, d.leadMs) ?? d.leadMs;
  return {
    theme: oneOf(p.theme, THEMES, d.theme),
    fontStep: Math.min(FONT_STEPS.length - 1, Math.max(0, Math.round(fontStep))),
    fontFamily: oneOf(p.fontFamily, FONTS, d.fontFamily),
    spacing: oneOf(p.spacing, SPACINGS, d.spacing),
    margins: oneOf(p.margins, MARGINS, d.margins),
    justify: bool(p.justify, d.justify),
    gimbal: bool(p.gimbal, d.gimbal),
    strength: oneOf(p.strength, STRENGTHS, d.strength),
    enlargeOnShake: bool(p.enlargeOnShake, d.enlargeOnShake),
    leadMs: Math.min(MAX_LEAD_MS, Math.max(0, leadMs)),
    showSensorReadout: bool(p.showSensorReadout, d.showSensorReadout),
  };
}

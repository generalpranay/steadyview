import type { Strength } from '../steadyview';

export type BookKind = 'epub' | 'pdf';

export interface Bookmark {
  id: string;
  /** EPUB CFI or PDF page number (as a string). */
  location: string;
  label: string;
  percent: number | null;
  createdAt: number;
}

export interface Book {
  id: string;
  kind: BookKind;
  title: string;
  author: string | null;
  /** File name inside the app's books folder (paths are resolved at runtime). */
  fileName: string;
  /** File name inside the covers folder, if we have a cover image. */
  coverName: string | null;
  /** Title came from the file name, so the book's own metadata may replace it. */
  titleFromFile: boolean;
  /** We already tried to extract a cover in the reader. */
  coverChecked: boolean;
  hasLocations: boolean;
  addedAt: number;
  lastOpenedAt: number | null;
  /** Saved reading position. */
  location: string | null;
  /** 0..1, or 0 when unknown. */
  percent: number;
  chapter: string | null;
  finished: boolean;
  bookmarks: Bookmark[];
  builtIn?: boolean;
}

export type ThemeName = 'paper' | 'sepia' | 'dusk' | 'night';
export type FontFamily = 'original' | 'serif' | 'sans' | 'rounded';
export type Spacing = 'compact' | 'normal' | 'relaxed';
export type Margins = 'narrow' | 'normal' | 'wide';

export interface Prefs {
  theme: ThemeName;
  /** Index into FONT_STEPS. */
  fontStep: number;
  fontFamily: FontFamily;
  spacing: Spacing;
  margins: Margins;
  justify: boolean;
  /** Steady Mode (the gimbal). Off until the reader turns it on. */
  gimbal: boolean;
  strength: Strength;
  enlargeOnShake: boolean;
  leadMs: number;
  showSensorReadout: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'paper',
  fontStep: 3,
  fontFamily: 'serif',
  spacing: 'normal',
  margins: 'normal',
  justify: false,
  gimbal: false,
  strength: 'balanced',
  enlargeOnShake: true,
  leadMs: 0,
  showSensorReadout: false,
};

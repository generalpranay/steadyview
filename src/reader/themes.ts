import type { FontFamily, Margins, Prefs, Spacing, ThemeName } from '../library/types';

export interface PageTheme {
  name: ThemeName;
  label: string;
  dark: boolean;
  bg: string;
  fg: string;
  muted: string;
  link: string;
  /** Reader chrome (top/bottom bars, sheets). */
  chrome: string;
  chromeBorder: string;
  /** CSS filter applied to PDF pages. */
  pdfFilter: string;
}

export const PAGE_THEMES: Record<ThemeName, PageTheme> = {
  paper: {
    name: 'paper',
    label: 'Paper',
    dark: false,
    bg: '#FBF8F1',
    fg: '#1F1D1A',
    muted: '#8A857B',
    link: '#0F6E56',
    chrome: '#FFFDF8',
    chromeBorder: '#E6E0D3',
    pdfFilter: 'none',
  },
  sepia: {
    name: 'sepia',
    label: 'Sepia',
    dark: false,
    bg: '#F3E7CF',
    fg: '#4A3826',
    muted: '#8C7A61',
    link: '#8A4B12',
    chrome: '#F8EEDA',
    chromeBorder: '#E2D3B4',
    pdfFilter: 'sepia(0.35) saturate(1.1) brightness(0.96)',
  },
  dusk: {
    name: 'dusk',
    label: 'Dusk',
    dark: true,
    bg: '#3A3B3F',
    fg: '#E6E3DC',
    muted: '#A5A39E',
    link: '#9FE1CB',
    chrome: '#2F3034',
    chromeBorder: '#4A4B50',
    pdfFilter: 'invert(0.82) hue-rotate(180deg)',
  },
  night: {
    name: 'night',
    label: 'Night',
    dark: true,
    bg: '#121212',
    fg: '#D6D2C8',
    muted: '#8D8A83',
    link: '#5DCAA5',
    chrome: '#1C1C1C',
    chromeBorder: '#2E2E2E',
    pdfFilter: 'invert(0.9) hue-rotate(180deg)',
  },
};

export const THEME_ORDER: ThemeName[] = ['paper', 'sepia', 'dusk', 'night'];

/** Font size as a percentage of the book's own size. */
export const FONT_STEPS = [75, 85, 92, 100, 110, 120, 135, 150, 170, 200];

export const LINE_HEIGHT: Record<Spacing, number> = { compact: 1.35, normal: 1.55, relaxed: 1.85 };
export const MARGIN_PX: Record<Margins, number> = { narrow: 14, normal: 26, wide: 44 };

export const FONT_LABELS: { value: FontFamily; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'rounded', label: 'Rounded' },
];

/** Steps added when "Enlarge when shaking" kicks in. */
export const SHAKE_BOOST_STEPS = 2;

/** The settings object the WebView renderers understand (see web-reader/*.js). */
export interface WebSettings {
  bg: string;
  fg: string;
  muted: string;
  link: string;
  dark: boolean;
  fontSize: number;
  fontFamily: FontFamily;
  lineHeight: number;
  justify: boolean;
  margin: number;
  insetTop: number;
  insetBottom: number;
  pdfMargin: number;
  pdfFilter: string;
}

export function webSettings(
  prefs: Prefs,
  insets: { top: number; bottom: number },
  boosted: boolean
): WebSettings {
  const t = PAGE_THEMES[prefs.theme];
  const step = Math.min(FONT_STEPS.length - 1, prefs.fontStep + (boosted ? SHAKE_BOOST_STEPS : 0));
  return {
    bg: t.bg,
    fg: t.fg,
    muted: t.muted,
    link: t.link,
    dark: t.dark,
    fontSize: FONT_STEPS[step],
    fontFamily: prefs.fontFamily,
    lineHeight: boosted ? Math.max(LINE_HEIGHT[prefs.spacing], LINE_HEIGHT.relaxed) : LINE_HEIGHT[prefs.spacing],
    justify: prefs.justify,
    margin: MARGIN_PX[prefs.margins],
    insetTop: insets.top,
    insetBottom: insets.bottom,
    pdfMargin: 8,
    pdfFilter: t.pdfFilter,
  };
}

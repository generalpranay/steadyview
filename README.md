# SteadyView

An offline **EPUB and PDF reader** for Android and iOS with **Steady Mode**: a software gimbal for your screen.
When the bus rattles or your hand trembles, the page moves against the shake so the words stay put.
When the phone is still, the page is perfectly still.

Built with Expo SDK 58, React Native 0.88 and TypeScript.

---

## Features

**Library**
- Bottom tab bar: **All**, **Reading**, **Unread**, **Finished**. Swipe left or right to move between tabs.
- "Continue reading" card, cover grid with progress, long-press a book to mark it finished or remove it.
- A built-in welcome guide on first launch.

**Import**
- Add EPUB and PDF files from Files, iCloud Drive, Google Drive or Downloads.
- Books are copied into the app and work fully offline. EPUB title, author and cover are read on import.
- Files over 100 MB are refused with a clear message (the reader holds the whole book in memory).

**Reader**
- EPUB: paginated. Swipe, or tap the left/right edge, to turn pages. The page follows your finger and slides to the next page.
  Respects the system "Reduce Motion" setting.
- PDF: continuous scroll with pinch zoom.
- Tap the centre of the page to show the menus; tap the page again to hide them.
- **Aa settings**: text size, typeface, line spacing, margins, justification, and page themes (Paper, Sepia, Dusk, Night).
  PDFs are recoloured to match the theme.
- Table of contents, bookmarks, and a progress scrubber to jump anywhere.

**Steady Mode** (opt-in, from the reader's top bar or Settings)
- Strengths: **Gentle** (a slight nudge), **Balanced**, **Strong**.
- Live motion meter, and an option to enlarge EPUB text automatically on rough rides.

---

## Run it

Requirements: a current Node.js LTS release, and the **Expo Go** app on your phone.

```bash
npm install
npx expo start            # scan the QR code (iPhone: Camera app, Android: Expo Go)
```

Use `npx expo start --tunnel` if your phone can't reach your computer over Wi-Fi.

If Expo Go reports a missing or mismatched native module, run `npx expo install --fix` or use a development build
(`npx eas-cli@latest build --profile development`). For store builds, use EAS: `npx eas-cli@latest build -p android` / `-p ios`.

---

## How Steady Mode works

```
sensors (UI thread) → bias removal + deadzone → stillness gate → spring-damper + tilt tracking → soft limit → GPU transform
```

- **Inputs**: linear acceleration (sliding motion) and the gyroscope on all three axes:
  twist (roll) and tipping forward/back or side to side (the "pan" sway you get in a vehicle).
- **Stillness gate**: below a shake threshold the gimbal fades out completely, so sensor noise never moves the page.
- **Spring-damper**: cancels fast jitter (walking, tremor, engines) while letting slow, intentional movement through.
- **Tilt tracking**: tipping the phone slides the screen a little (the hand pivots behind it); a leaky integrator
  counters quick sway but ignores slow, deliberate tilting.
- **Small, soft corrections**: at most **4 / 8 / 14 pt** (Gentle / Balanced / Strong).
- Sensors run only while Steady Mode is on; the page never reloads when you toggle it.

The engine is pure math (`src/steadyview/engine.ts`) and runs as a Reanimated worklet on the UI thread.

---

## Privacy and security

- **Nothing leaves the device.** There is no account, analytics or server.
- **Books can't reach the network.** The reader pages carry a Content-Security-Policy that only allows the book's own
  embedded resources, and the WebView refuses to navigate to any non-local URL. A remote image in an EPUB is blocked.
- **Book scripts don't run.** EPUB content is rendered in sandboxed frames without script permission.
  PDFs are rendered with pdf.js using `isEvalSupported: false` (the mitigation for CVE-2024-4367).
- **Untrusted input is validated**: messages from the reader WebView, and everything read back from storage
  (file names are checked so they can't point outside the app's folders).

---

## Project layout

| Path | What it is |
|---|---|
| `src/app/` | Screens (Expo Router): library `index.tsx`, `reader/[id].tsx`, `settings.tsx` |
| `src/steadyview/` | Gimbal engine (pure math), sensor driver, `SteadyView` wrapper |
| `src/library/` | Library state (AsyncStorage), storage validation, import, EPUB metadata, files, welcome guide |
| `src/reader/` | `BookView` (WebView bridge), message validation, Aa and Contents sheets, page themes |
| `src/ui/` | Shared UI: bottom tabs, book cover, progress bar, sheets, app theme |
| `web-reader/` | Renderer code that runs inside the WebView (epub.js / pdf.js) |
| `src/reader/web/*.generated.ts` | Offline bundles of the renderers, committed. Rebuild after editing `web-reader/` |
| `scripts/build-reader-html.mjs` | Builds the reader bundles (see its header for the vendor libraries it needs) |

---

## Scripts

```bash
npm test              # Jest: gimbal engine, storage validation, reader messages, EPUB metadata
npm run typecheck     # tsc --noEmit
npx expo lint         # ESLint
npm run build:reader  # regenerate reader bundles (needs epubjs@0.3.93, jszip@3.10.1, pdfjs-dist@3.11.174)
```

---

## Known limitations

- PDF reading uses pdf.js 3.11. It is configured safely, but upgrading to pdf.js 4.x is recommended.
- Books larger than 100 MB can't be imported.
- Steady Mode's tilt correction uses an estimated pivot distance (`panLever` in `engine.ts`); it may need tuning per device.

## Ideas next

- Highlights, notes, and search inside a book.
- Front-camera head tracking to cancel phone-to-eye motion.
- Reading stats and goals.

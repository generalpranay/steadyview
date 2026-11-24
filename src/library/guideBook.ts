import JSZip from 'jszip';

/**
 * The built-in "Welcome to SteadyView" EPUB, generated on first launch so the
 * library is never empty and every reader feature can be tried immediately.
 * All text is original to this app.
 */

const TITLE = 'Welcome to SteadyView';
const AUTHOR = 'SteadyView';
const BOOK_ID = 'urn:uuid:5f0c7a52-steadyview-guide-v1';

interface Chapter {
  id: string;
  title: string;
  paragraphs: string[];
}

const CHAPTERS: Chapter[] = [
  {
    id: 'ch1',
    title: 'A reader that holds still',
    paragraphs: [
      'SteadyView is a book reader with one unusual trick: a gimbal for your screen. When the bus rattles or your hand trembles, it nudges the page against the shake so the words stay put.',
      'The gimbal is off until you want it. Tap the middle of any page to show the controls, then tap the steady-frame button at the top. A small badge tells you when it is on.',
      'When the phone is still, the page is still. The gimbal sleeps until it feels real motion and wakes up gently, so you will never see the text drift while you are sitting quietly.',
    ],
  },
  {
    id: 'ch2',
    title: 'Turning pages',
    paragraphs: [
      'Swipe left or right, or tap near the right edge to go forward and the left edge to go back. Tap the centre to show or hide the menus.',
      'The bar at the bottom shows how far you are through the book. Drag it to jump anywhere, and the label tells you how many pages are left in the chapter.',
      'Tap the list button to see the contents. Tap the ribbon to bookmark a page, and find every bookmark in the second tab of the contents sheet.',
    ],
  },
  {
    id: 'ch3',
    title: 'Make it yours',
    paragraphs: [
      'The Aa button opens text settings. Choose a size, a typeface, the spacing between lines, and the width of the margins. Pick a page colour: Paper, Sepia, Dusk or Night.',
      'Under Steady Mode you can choose how strongly the gimbal works. Gentle makes small, quick corrections. Strong cancels more shake but takes a moment longer to settle.',
      'Turn on Enlarge When Shaking and the text grows a little whenever the ride gets rough, then shrinks back once things calm down.',
    ],
  },
  {
    id: 'ch4',
    title: 'Bring your own books',
    paragraphs: [
      'Go back to the library and tap the plus button to add EPUB or PDF files from your phone, from iCloud Drive, Google Drive or anywhere the file picker can reach.',
      'Books are copied into the app, so they stay available offline. Your place, bookmarks and settings are saved as you read.',
      'Press and hold a book in the library to mark it finished or remove it. Happy reading, wherever the road takes you.',
    ],
  },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function chapterXhtml(c: Chapter): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>${esc(c.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><section epub:type="chapter"><h1>${esc(c.title)}</h1>
${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}
</section></body></html>`;
}

const COVER_SVG = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
<rect width="600" height="900" fill="#0F6E56"/>
<rect x="40" y="40" width="520" height="820" fill="none" stroke="#9FE1CB" stroke-width="2"/>
<g fill="none" stroke="#E1F5EE" stroke-width="10" stroke-linecap="round">
<path d="M220 300 h-40 v40"/><path d="M380 300 h40 v40"/><path d="M220 520 h-40 v-40"/><path d="M380 520 h40 v-40"/>
</g>
<rect x="250" y="350" width="100" height="120" rx="10" fill="#E1F5EE"/>
<text x="300" y="660" font-family="Georgia, serif" font-size="56" fill="#FFFFFF" text-anchor="middle">Welcome to</text>
<text x="300" y="730" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="#FFFFFF" text-anchor="middle">SteadyView</text>
</svg>`;

export const GUIDE_TITLE = TITLE;
export const GUIDE_AUTHOR = AUTHOR;
export const GUIDE_COVER_SVG = COVER_SVG;

/** Returns the guide EPUB as base64. */
export async function buildGuideEpub(): Promise<string> {
  const zip = new JSZip();
  // The mimetype entry must be first and uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );
  const manifest = CHAPTERS.map(
    (c) => `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');
  const spine = CHAPTERS.map((c) => `<itemref idref="${c.id}"/>`).join('\n');
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${BOOK_ID}</dc:identifier>
<dc:title>${TITLE}</dc:title><dc:creator>${AUTHOR}</dc:creator><dc:language>en</dc:language>
<meta property="dcterms:modified">2026-11-01T00:00:00Z</meta>
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
${manifest}
</manifest>
<spine toc="ncx">
${spine}
</spine>
</package>`
  );
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head>
<body><nav epub:type="toc"><h1>Contents</h1><ol>
${CHAPTERS.map((c) => `<li><a href="${c.id}.xhtml">${esc(c.title)}</a></li>`).join('\n')}
</ol></nav></body></html>`
  );
  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${BOOK_ID}"/></head>
<docTitle><text>${TITLE}</text></docTitle>
<navMap>
${CHAPTERS.map(
  (c, i) =>
    `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="${c.id}.xhtml"/></navPoint>`
).join('\n')}
</navMap></ncx>`
  );
  zip.file(
    'OEBPS/style.css',
    'h1{font-size:1.5em;margin:1.2em 0 .8em;line-height:1.25}p{margin:0 0 .9em;text-indent:0}'
  );
  zip.file('OEBPS/cover.svg', COVER_SVG);
  for (const c of CHAPTERS) zip.file(`OEBPS/${c.id}.xhtml`, chapterXhtml(c));
  return zip.generateAsync({ type: 'base64', mimeType: 'application/epub+zip' });
}

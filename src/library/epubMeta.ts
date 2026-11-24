import JSZip from 'jszip';

export interface EpubMeta {
  title: string | null;
  author: string | null;
  /** Cover image as base64 with its MIME type, if the book declares one. */
  cover: { base64: string; mime: string } | null;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

function tagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:[a-z]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[a-z]+:)?${tag}>`, 'i'));
  if (!m) return null;
  const text = decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim();
  return text || null;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
}

/** Like decodeURIComponent, but a malformed escape (e.g. "100%.jpg") is kept as-is instead of throwing. */
function safeDecode(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

export function resolvePath(base: string, href: string): string {
  const parts = (base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '').split('/').filter(Boolean);
  for (const seg of safeDecode(href).split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

/** Reads title, author and cover from an EPUB (base64) without rendering it. */
export async function readEpubMeta(base64: string): Promise<EpubMeta> {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container ? attr(container.match(/<rootfile\b[^>]*>/i)?.[0] ?? '', 'full-path') : null;
  const opf = opfPath ? await zip.file(opfPath)?.async('string') : undefined;
  if (!opf || !opfPath) return { title: null, author: null, cover: null };

  const title = tagText(opf, 'title');
  const author = tagText(opf, 'creator');

  const items = opf.match(/<item\b[^>]*>/gi) ?? [];
  let coverHref: string | null = null;
  let coverMime = 'image/jpeg';
  // EPUB 3: properties="cover-image"
  for (const it of items) {
    if (/\bproperties\s*=\s*["'][^"']*cover-image/i.test(it)) {
      coverHref = attr(it, 'href');
      coverMime = attr(it, 'media-type') ?? coverMime;
      break;
    }
  }
  // EPUB 2: <meta name="cover" content="item-id"/>
  if (!coverHref) {
    const metaTag = (opf.match(/<meta\b[^>]*>/gi) ?? []).find((m) => attr(m, 'name') === 'cover');
    const id = metaTag ? attr(metaTag, 'content') : null;
    const item = id ? items.find((it) => attr(it, 'id') === id) : undefined;
    if (item) {
      coverHref = attr(item, 'href');
      coverMime = attr(item, 'media-type') ?? coverMime;
    }
  }
  // Fallback: an image item whose id or href mentions "cover".
  if (!coverHref) {
    const item = items.find((it) => /image\//.test(attr(it, 'media-type') ?? '') && /cover/i.test(it));
    if (item) {
      coverHref = attr(item, 'href');
      coverMime = attr(item, 'media-type') ?? coverMime;
    }
  }

  let cover: EpubMeta['cover'] = null;
  if (coverHref) {
    const file = zip.file(resolvePath(opfPath, coverHref));
    if (file) cover = { base64: await file.async('base64'), mime: coverMime };
  }
  return { title, author, cover };
}

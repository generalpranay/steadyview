import { writeFileSync } from 'node:fs';

import JSZip from 'jszip';

import { buildGuideEpub, GUIDE_AUTHOR, GUIDE_TITLE } from '../guideBook';
import { readEpubMeta } from '../epubMeta';

describe('built-in guide book', () => {
  it('builds a valid EPUB whose metadata and cover can be read back', async () => {
    const b64 = await buildGuideEpub();
    expect(b64.length).toBeGreaterThan(1000);
    const meta = await readEpubMeta(b64);
    expect(meta.title).toBe(GUIDE_TITLE);
    expect(meta.author).toBe(GUIDE_AUTHOR);
    expect(meta.cover?.mime).toBe('image/svg+xml');
    expect(Buffer.from(meta.cover!.base64, 'base64').toString('utf8')).toContain('<svg');
    // Starts with the uncompressed mimetype entry, as the EPUB spec requires.
    const bytes = Buffer.from(b64, 'base64');
    expect(bytes.subarray(30, 50).toString('latin1')).toBe('mimetypeapplication/');
    if (process.env.SV_DUMP_DIR) writeFileSync(`${process.env.SV_DUMP_DIR}/guide.epub`, bytes);
  });

  it('reads EPUB 2 style covers and handles missing metadata', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file(
      'META-INF/container.xml',
      '<container><rootfiles><rootfile full-path="book/pkg.opf"/></rootfiles></container>'
    );
    zip.file(
      'book/pkg.opf',
      `<package><metadata><dc:title>Tom &amp; Jerry</dc:title><meta name="cover" content="c1"/></metadata>
       <manifest><item id="c1" href="../img/front.png" media-type="image/png"/></manifest></package>`
    );
    zip.file('img/front.png', 'PNGDATA');
    const meta = await readEpubMeta(await zip.generateAsync({ type: 'base64' }));
    expect(meta.title).toBe('Tom & Jerry');
    expect(meta.author).toBeNull();
    expect(meta.cover?.mime).toBe('image/png');
    expect(Buffer.from(meta.cover!.base64, 'base64').toString()).toBe('PNGDATA');
  });
});

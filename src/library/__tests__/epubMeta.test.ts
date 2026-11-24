import { resolvePath } from '../epubMeta';

describe('resolvePath', () => {
  it('resolves an href relative to the OPF file', () => {
    expect(resolvePath('OEBPS/content.opf', 'images/cover.jpg')).toBe('OEBPS/images/cover.jpg');
    expect(resolvePath('OEBPS/text/content.opf', '../img/c.png')).toBe('OEBPS/img/c.png');
    expect(resolvePath('content.opf', 'cover%20art.jpg')).toBe('cover art.jpg');
  });

  it('does not throw on a malformed % escape (previously rejected the whole book as damaged)', () => {
    expect(resolvePath('OEBPS/content.opf', 'images/100%.jpg')).toBe('OEBPS/images/100%.jpg');
  });
});

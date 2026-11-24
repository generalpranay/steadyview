import { isLocalUrl, parseReaderMessage } from '../readerMessages';

const msg = (o: unknown) => parseReaderMessage(JSON.stringify(o));

describe('parseReaderMessage', () => {
  it('accepts the messages the reader sends', () => {
    expect(msg({ t: 'ready' })).toEqual({ t: 'ready' });
    expect(msg({ t: 'tap' })).toEqual({ t: 'tap' });
    expect(msg({ t: 'locations', data: '["epubcfi(/6/2)"]' })).toEqual({ t: 'locations', data: '["epubcfi(/6/2)"]' });
    expect(msg({ t: 'cover', dataUrl: 'data:image/png;base64,AAAA' })).toEqual({ t: 'cover', dataUrl: 'data:image/png;base64,AAAA' });
  });

  it('keeps relocation data and clamps the percentage', () => {
    expect(msg({ t: 'relocated', location: 'epubcfi(/6/4)', percent: 1.7, chapter: 'One', pageInChapter: 2, pagesInChapter: 5 })).toEqual(
      expect.objectContaining({ t: 'relocated', location: 'epubcfi(/6/4)', percent: 1, chapter: 'One', pageInChapter: 2 })
    );
    expect(msg({ t: 'relocated', location: '3', percent: null, page: 3, totalPages: 10 })).toEqual(
      expect.objectContaining({ percent: null, page: 3, totalPages: 10 })
    );
  });

  it('keeps valid contents entries and drops broken ones', () => {
    const r = msg({
      t: 'loaded',
      kind: 'epub',
      toc: [{ label: 'One', target: { href: 'c1.xhtml' }, depth: 0 }, { label: 'Bad' }, { target: { page: 2 } }],
      meta: { title: 'T', author: 5 },
    });
    expect(r).toEqual({ t: 'loaded', kind: 'epub', toc: [{ label: 'One', target: { href: 'c1.xhtml', page: undefined }, depth: 0 }], totalPages: undefined, meta: { title: 'T', author: null } });
  });

  it('drops malformed, unknown or oversized messages', () => {
    expect(parseReaderMessage('not json')).toBeNull();
    expect(msg(null)).toBeNull();
    expect(msg({ t: 'deleteEverything' })).toBeNull();
    expect(msg({ t: 'relocated' })).toBeNull();
    expect(msg({ t: 'locations', data: 42 })).toBeNull();
    expect(msg({ t: 'cover', dataUrl: 'javascript:alert(1)' })).toBeNull();
    expect(msg({ t: 'cover', dataUrl: 'data:text/html;base64,AAAA' })).toBeNull();
    expect(msg({ t: 'locations', data: 'x'.repeat(5_000_001) })).toBeNull();
    expect(msg({ t: 'loaded', kind: 'exe', toc: [] })).toBeNull();
  });

  it('caps the length of error text shown to the reader', () => {
    const r = msg({ t: 'error', message: 'x'.repeat(10_000) });
    expect(r?.t === 'error' && r.message.length).toBe(500);
  });
});

describe('isLocalUrl', () => {
  it('allows only the reader page and in-memory book resources', () => {
    for (const u of ['about:blank', 'about:srcdoc', 'blob:null/1234', 'data:text/html,hi']) expect(isLocalUrl(u)).toBe(true);
    for (const u of ['https://tracker.example/p.png', 'http://x', 'file:///data/user/0/app/files/books/a.epub', 'intent://scan', 'javascript:alert(1)']) {
      expect(isLocalUrl(u)).toBe(false);
    }
  });
});

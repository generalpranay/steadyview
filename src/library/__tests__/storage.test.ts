import { parseBooks, parsePrefs, toBook } from '../storage';
import { DEFAULT_PREFS } from '../types';

const goodBook = {
  id: 'mf3k2a9x1b2c',
  kind: 'epub',
  fileName: 'mf3k2a9x1b2c.epub',
  title: 'A Book',
  author: 'Someone',
  coverName: 'mf3k2a9x1b2c-mf3k2b.jpg',
  percent: 0.42,
  lastOpenedAt: 1700000000000,
  bookmarks: [{ id: 'b1', location: 'epubcfi(/6/4)', label: 'Ch 1', percent: 0.1, createdAt: 1 }],
};

describe('parseBooks', () => {
  it('treats a first launch (nothing saved) as an empty library', () => {
    expect(parseBooks(null)).toEqual({ ok: true, books: [], dropped: 0 });
  });

  it('reports corrupted JSON instead of silently returning an empty library', () => {
    const r = parseBooks('[{"id": "abc", "kind": "ep');
    expect(r.ok).toBe(false);
  });

  it('reports a non-list value as corrupted', () => {
    expect(parseBooks('{"id":"x"}').ok).toBe(false);
  });

  it('keeps good books and drops unusable entries', () => {
    const r = parseBooks(JSON.stringify([goodBook, { id: 'x' }, null, 'junk']));
    expect(r.ok && r.books.map((b) => b.id)).toEqual([goodBook.id]);
    expect(r.ok && r.dropped).toBe(3);
  });
});

describe('toBook', () => {
  it('round-trips a valid book', () => {
    const b = toBook(goodBook);
    expect(b).toMatchObject({ id: goodBook.id, fileName: goodBook.fileName, coverName: goodBook.coverName, percent: 0.42 });
    expect(b?.bookmarks).toHaveLength(1);
  });

  it('rejects file names that could escape the books folder', () => {
    for (const fileName of ['../../secrets.epub', '/etc/passwd', 'a/b.epub', 'x.epub/../y', 'book.exe', '']) {
      expect(toBook({ ...goodBook, fileName })).toBeNull();
    }
  });

  it('drops a cover name that could escape the covers folder, but keeps the book', () => {
    const b = toBook({ ...goodBook, coverName: '../books/other.epub' });
    expect(b).not.toBeNull();
    expect(b?.coverName).toBeNull();
  });

  it('rejects unknown kinds and odd ids', () => {
    expect(toBook({ ...goodBook, kind: 'mobi' })).toBeNull();
    expect(toBook({ ...goodBook, id: '../x' })).toBeNull();
  });

  it('fills missing fields with safe defaults and clamps progress', () => {
    const b = toBook({ id: 'abc', kind: 'pdf', fileName: 'abc.pdf', percent: 7, bookmarks: 'nope' });
    expect(b).toMatchObject({ title: 'Untitled', author: null, percent: 1, bookmarks: [], finished: false, lastOpenedAt: null });
  });
});

describe('parsePrefs', () => {
  it('uses defaults when nothing is saved or the value is corrupted', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{not json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('[1,2]')).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid saved values', () => {
    const p = parsePrefs(JSON.stringify({ theme: 'night', fontStep: 6, strength: 'gentle', gimbal: true }));
    expect(p).toMatchObject({ theme: 'night', fontStep: 6, strength: 'gentle', gimbal: true });
  });

  it('replaces values that would crash the reader (unknown theme, font step out of range)', () => {
    const p = parsePrefs(JSON.stringify({ theme: 'neon', fontStep: 99, fontFamily: 7, strength: 'max', leadMs: -5 }));
    expect(p.theme).toBe(DEFAULT_PREFS.theme);
    expect(p.fontStep).toBe(9);
    expect(p.fontFamily).toBe(DEFAULT_PREFS.fontFamily);
    expect(p.strength).toBe(DEFAULT_PREFS.strength);
    expect(p.leadMs).toBe(0);
  });

  it('ignores extra keys from older or newer app versions', () => {
    expect(parsePrefs(JSON.stringify({ somethingNew: true }))).toEqual(DEFAULT_PREFS);
  });
});

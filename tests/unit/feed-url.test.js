import { describe, expect, it } from 'vitest';
import { normalizeFeedUrl } from '../../server/utils/feeds.js';

describe('normalizeFeedUrl', () => {
  it('adds https when the scheme is missing', () => {
    expect(normalizeFeedUrl('news.ycombinator.com/rss')).toBe(
      'https://news.ycombinator.com/rss'
    );
  });

  it('drops tracking parameters and the trailing slash', () => {
    expect(
      normalizeFeedUrl('https://example.com/feed/?utm_source=x&utm_medium=y')
    ).toBe('https://example.com/feed');
  });

  it('keeps meaningful query parameters', () => {
    expect(normalizeFeedUrl('https://example.com/rss?tag=ai')).toBe(
      'https://example.com/rss?tag=ai'
    );
  });

  it('lowercases the host but not the path', () => {
    expect(normalizeFeedUrl('https://Example.COM/Feed')).toBe(
      'https://example.com/Feed'
    );
  });

  it('treats two spellings of the same feed as one URL', () => {
    const a = normalizeFeedUrl('https://example.com/feed/?ref=hn');
    const b = normalizeFeedUrl('https://EXAMPLE.com/feed');
    expect(a).toBe(b);
  });

  it('rejects non-http schemes', () => {
    expect(() => normalizeFeedUrl('ftp://example.com/feed')).toThrow();
  });

  it('rejects an empty value', () => {
    expect(() => normalizeFeedUrl('   ')).toThrow();
  });
});

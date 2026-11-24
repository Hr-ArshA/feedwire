import { describe, expect, it } from 'vitest';
import { parseFeed, toPlainText } from '../../server/utils/rss.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example News</title>
    <link>https://example.com/</link>
    <item>
      <title>First &amp; foremost</title>
      <link>https://example.com/first</link>
      <guid>first-1</guid>
      <description><![CDATA[<p>Hello <b>world</b></p>]]></description>
      <pubDate>Mon, 02 Jan 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second</title>
      <link>https://example.com/second</link>
      <guid>second-2</guid>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <link href="https://atom.example.com/"/>
  <entry>
    <title>Atom entry</title>
    <link href="https://atom.example.com/entry"/>
    <id>urn:uuid:1</id>
    <updated>2026-01-02T10:00:00Z</updated>
    <summary>Plain summary</summary>
  </entry>
</feed>`;

describe('parseFeed', () => {
  it('reads an RSS 2.0 channel', () => {
    const feed = parseFeed(RSS, 'https://example.com/rss');
    expect(feed.title).toBe('Example News');
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0].title).toBe('First & foremost');
    expect(feed.items[0].guid).toBe('first-1');
    expect(feed.items[0].summary).toContain('Hello');
    expect(feed.items[0].summary).not.toContain('<b>');
  });

  it('reads an Atom feed', () => {
    const feed = parseFeed(ATOM, 'https://atom.example.com/feed');
    expect(feed.title).toBe('Atom Example');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].link).toBe('https://atom.example.com/entry');
  });

  it('throws on something that is not a feed', () => {
    expect(() => parseFeed('<html><body>nope</body></html>', 'https://x')).toThrow();
  });
});

describe('toPlainText', () => {
  it('strips tags and decodes entities', () => {
    expect(toPlainText('<p>a &amp; b</p>')).toBe('a & b');
  });
  it('truncates to the requested length', () => {
    expect(toPlainText('x'.repeat(50), 10).length).toBeLessThanOrEqual(11);
  });
});

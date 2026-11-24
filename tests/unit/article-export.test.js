import { describe, expect, it } from 'vitest';
import {
  buildExport,
  buildTranslationExport,
  htmlToMarkdown,
  htmlToText,
  isExportFormat,
  slugify,
} from '../../server/utils/article-export.js';

const article = {
  id: 7,
  title: 'A Test Story',
  link: 'https://example.com/story',
  author: 'Jane',
  published_at: '2026-01-02T10:00:00.000Z',
  html: '<h1>A Test Story</h1><p>Hello <strong>world</strong>.</p><ul><li>one</li></ul>',
  text: 'A Test Story Hello world. one',
};

describe('article export', () => {
  it('converts html to text', () => {
    const text = htmlToText(article.html);
    expect(text).toContain('Hello world');
    expect(text).not.toContain('<p>');
  });

  it('converts html to markdown', () => {
    const md = htmlToMarkdown(article.html);
    expect(md).toContain('**world**');
    expect(md).toContain('one');
  });

  it('builds txt, md and html exports', () => {
    const txt = buildExport(article, 'txt');
    expect(txt.body).toContain('A Test Story');
    const md = buildExport(article, 'md');
    expect(md.body).toContain('# A Test Story');
    const html = buildExport(article, 'html');
    expect(html.body).toContain('<!doctype html>');
  });

  it('rejects an unknown format', () => {
    expect(isExportFormat('docx')).toBe(false);
    expect(() => buildExport(article, 'docx')).toThrow();
  });

  it('builds a translation export', () => {
    const out = buildTranslationExport(
      article,
      { title: 'ÛŒÚ© Ø¯Ø§Ø³ØªØ§Ù†', text: 'Ø³Ù„Ø§Ù… Ø¯Ù†ÛŒØ§' },
      'txt'
    );
    expect(out.body).toContain('Ø³Ù„Ø§Ù… Ø¯Ù†ÛŒØ§');
  });

  it('slugifies titles for filenames', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });
});


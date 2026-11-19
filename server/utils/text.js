const DIACRITICS = /[\u064B-\u065F\u0670]/g;
const BIDI_MARKS = /[\u200B-\u200F\u202A-\u202E\uFEFF]/g;
const PERSIAN_DIGITS = /[\u06F0-\u06F9]/g;
const ARABIC_DIGITS = /[\u0660-\u0669]/g;

/**
 * Normalizes Persian/Arabic text so that lexical search is not defeated by
 * ZWNJ, Arabic vs Persian letter forms, diacritics or digit variants.
 */
export function normalizeText(input) {
  if (!input) return '';
  return String(input)
    .normalize('NFKC')
    .replace(DIACRITICS, '')
    .replace(/\u0640/g, '')
    .replace(BIDI_MARKS, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی')
    .replace(PERSIAN_DIGITS, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0x06f0 + 48)
    )
    .replace(ARABIC_DIGITS, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0x0660 + 48)
    )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(input) {
  return normalizeText(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

export function buildFtsQuery(input, operator = 'AND') {
  const tokens = tokenize(input);
  if (!tokens.length) return null;
  return tokens
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(` ${operator} `);
}

export function clampText(input, max = 1500) {
  if (!input) return '';
  const text = String(input).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Strip markdown-ish noise and normalize punctuation for TTS (chunk + full message).
 * - Markdown bold/italic markers, images
 * - Em/en dashes → short pauses (comma)
 * - Ordered list markers like "1." → "1," so engines don’t treat "." as sentence end oddly
 * - Paragraph breaks: if the line already ends with . ! ? we only insert a space between
 *   blocks; otherwise we add ". " after a letter/digit/) so TTS gets a sentence boundary.
 *   We never strip normal sentence periods — the old `\\s+`→space step was folding *all*
 *   newlines into spaces, which removed pauses.
 */

function stripMarkdownImages(raw: string): string {
  return raw.replace(/!\[[^\]]*]\([^)]+\)/g, ' ');
}

/** Paired ** then * so we keep inner text without eating multiplication. */
function stripMarkdownEmphasis(raw: string): string {
  let s = raw;
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*\n]+)\*/g, '$1');
  s = s.replace(/\*+/g, '');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/_([^_\n]+)_/g, '$1');
  return s;
}

function normalizeDashes(raw: string): string {
  return raw
    .replace(/—/g, ', ')
    .replace(/–/g, ', ')
    .replace(/\s*--\s*/g, ', ');
}

/** # heading → heading */
function stripMarkdownHeadings(raw: string): string {
  return raw.replace(/^#{1,6}\s+/gm, '');
}

/**
 * "1. Foo" / line-start numbered lists → "1, Foo" (TTS handles comma better than "one dot").
 */
function normalizeOrderedListMarkers(raw: string): string {
  let s = raw;
  s = s.replace(/(^|\n)(\s*)(\d+)\.\s+/g, '$1$2$3, ');
  s = s.replace(/:\s*(\d+)\.\s+/g, ': $1, ');
  return s;
}

function normalizeBlankLinesForTts(s: string): string {
  let t = s.replace(/\r\n/g, '\n');
  t = t.replace(/([.!?])\n{2,}/g, '$1 '); // "First line.\n\nNext" → "First line. Next" (keep the dot)
  t = t.replace(/([A-Za-z0-9)])\n{2,}/g, '$1. '); // "Intro\n\n2." → "Intro. 2."
  t = t.replace(/\n{2,}/g, ' '); // e.g. after comma, still merge paragraph
  t = t.replace(/\n/g, ' ');
  t = t.replace(/(\.\s+){2,}/g, '. '); // rare ". . " from merges
  t = t.replace(/[ \t]+/g, ' ');
  return t.trim();
}

export function plainTextForNarrationTts(raw: string): string {
  let s = stripMarkdownImages(raw);
  s = stripMarkdownEmphasis(s);
  s = normalizeDashes(s);
  s = stripMarkdownHeadings(s);
  s = normalizeOrderedListMarkers(s);
  return normalizeBlankLinesForTts(s);
}

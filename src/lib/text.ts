/**
 * Split a text into its lead sentence and the remainder, so the lead can be
 * emphasized (answer-first FAQ style). Returns `[text, '']` when no clean
 * split exists.
 *
 * Boundary rules:
 * - Full-width CJK terminators (。！？) always end a sentence — CJK text has
 *   no whitespace after them.
 * - Half-width terminators (.!?) only end a sentence when NOT directly
 *   followed by a letter/digit (skips "e.g." internals and decimals like
 *   "1.5"), and not right after a known abbreviation (e.g. / i.e. / etc.).
 */
export function splitLeadSentence(text: string): [string, string] {
  const candidate = /[^.!?。！？]*[.!?。！？]+/y;
  let end = 0;
  while (end < text.length) {
    candidate.lastIndex = end;
    const match = candidate.exec(text);
    if (!match) break;
    end += match[0].length;
    const isFullWidth = /[。！？]$/.test(match[0]);
    if (!isFullWidth) {
      const next = text[end];
      if (next !== undefined && /[\p{L}\p{N}]/u.test(next)) continue;
      if (/(?:e\.g|i\.e|etc|vs|cf)\.$/i.test(text.slice(0, end))) continue;
    }
    break;
  }
  if (end <= 0 || end >= text.length) return [text, ''];
  return [text.slice(0, end).trimEnd(), text.slice(end).trimStart()];
}

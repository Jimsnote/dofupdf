/**
 * Escapes text extracted from source documents so it stays inert when the
 * downloaded Markdown is opened in a downstream viewer: backslash first, then
 * the emphasis/link/HTML metacharacters, plus line-start constructs (#, >,
 * -, +, 1.) that would otherwise become headings, quotes, or lists.
 *
 * This protects the DOWNLOADED artifact — it is not a mitigation for any
 * XSS on this site (there is no injection path into the page itself).
 */
export function escapeMarkdownText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/[`*_[\]<>|~]/g, (ch) => `\\${ch}`)
    .replace(/^(\s{0,3})([#>])/gm, '$1\\$2')
    .replace(/^(\s{0,3})(\d{1,9})([.)])(?=\s)/gm, '$1$2\\$3')
    .replace(/^(\s{0,3})([-+])(?=\s)/gm, '$1\\$2');
}

/**
 * Link protocols allowed to survive into Markdown links. Whitespace/control
 * characters are stripped before the check so `java\nscript:` cannot slip
 * through; anything with an exotic scheme (javascript:, data:, …) is refused
 * and should be rendered as plain text by the caller.
 */
export function isSafeLinkHref(href: string): boolean {
  const compact = href.replace(/[\u0000-\u0020 ]/g, '');
  if (/^(https?:|mailto:)/i.test(compact)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(compact);
}

/**
 * Data model for the /compare/ pages (Japanese-only, like the guides).
 * One file per comparison in this folder; the registry in index.ts publishes it.
 */
export interface CompareRow {
  feature: string;
  dofuPdf: string;
  them: string;
}

export interface CompareSource {
  label: string;
  url: string;
}

export interface CompareFaq {
  q: string;
  a: string;
}

export interface Compare {
  /** URL slug, e.g. 'dofupdf-vs-ilovepdf'. */
  slug: string;
  /** Competitor display name, e.g. 'iLovePDF'. */
  competitor: string;
  /** Page title (meta + H1), <=60 chars including "| DofuPDF" suffix. */
  title: string;
  /** Meta description, <=160 chars. */
  description: string;
  /** One-paragraph honest verdict shown under the H1 (AI-citable). */
  verdict: string;
  /** Feature comparison rows (DofuPDF column first). */
  rows: CompareRow[];
  /** Fact-check line, e.g. 'Fact checked on July 21, 2026'. */
  factChecked: string;
  /** Sources backing the competitor claims. */
  sources: CompareSource[];
  /** Where the competitor is genuinely the better choice — honest trade-offs. */
  theirStrengths: string[];
  faqs: CompareFaq[];
}

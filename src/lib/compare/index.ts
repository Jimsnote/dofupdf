import type { Compare } from './types';
import { dofuPdfVsIlovepdf } from './dofupdf-vs-ilovepdf';
import { dofuPdfVsSejda } from './dofupdf-vs-sejda';
import { dofuPdfVsSmallpdf } from './dofupdf-vs-smallpdf';

/**
 * Central registry for /compare/ pages (Korean-only). Adding a page here is
 * enough to publish it: the compare routes and sitemap derive from this list.
 */
export const compares: Compare[] = [dofuPdfVsIlovepdf, dofuPdfVsSmallpdf, dofuPdfVsSejda];

/** Looks up a comparison page by its URL slug. */
export function getCompare(slug: string): Compare | undefined {
  return compares.find((compare) => compare.slug === slug);
}

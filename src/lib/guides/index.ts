import type { Guide } from './types';
import { howToPasswordProtectPdf } from './how-to-password-protect-pdf';
import { howToUnlockPdf } from './how-to-unlock-pdf';
import { nenmatsuChoseiPdf } from './nenmatsu-chosei-pdf';
import { kakuteiShinkokuPdfPassword } from './kakutei-shinkoku-pdf-password';
import { ppapPdfPassword } from './ppap-pdf-password';
import { pdfPasswordKakeWindows } from './pdf-password-kake-windows';
import { pdfPasswordKakeMac } from './pdf-password-kake-mac';
import { pdfPasswordKakeMobile } from './pdf-password-kake-mobile';
import { excelPdfPassword } from './excel-pdf-password';
import { pdfPasswordSetteiDekinai } from './pdf-password-settei-dekinai';
import { pdfPasswordChange } from './pdf-password-change';
import { pdfPasswordCheck } from './pdf-password-check';

/**
 * Central guide registry, in display order. Guides are Japanese long-form
 * tutorials rendered at /guides/<slug>/; the sitemap and both guide routes
 * derive from this list, so adding a guide here is enough to publish it.
 *
 * W1 consolidation: only the two password guides stayed published at first.
 * W4 adds the 10-guide "PDF文書セキュリティ" cluster (seasonal, PPAP, kake
 * family, troubleshooting). The other pre-W4 guide data files remain in this
 * folder (code is kept, unpublished) and return 410 via src/worker/index.js.
 */
export const guides: Guide[] = [
  howToPasswordProtectPdf,
  howToUnlockPdf,
  // W4 cluster — seasonal first (nenmatsu-chosei is in season Oct–Dec)
  nenmatsuChoseiPdf,
  kakuteiShinkokuPdfPassword,
  // policy / how-to family
  ppapPdfPassword,
  pdfPasswordKakeWindows,
  pdfPasswordKakeMac,
  pdfPasswordKakeMobile,
  excelPdfPassword,
  // troubleshooting
  pdfPasswordSetteiDekinai,
  pdfPasswordChange,
  pdfPasswordCheck,
];

/** Looks up a guide by its URL slug. */
export function getGuide(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}

/** Finds the guide attached to a tool, if one has been written for it. */
export function getGuideForTool(toolSlug: string): Guide | undefined {
  // Preset variants of the organizer share the umbrella organize guide.
  const alias: Record<string, string> = { 'reorder-pages': 'organize-pdf' };
  const slug = alias[toolSlug] ?? toolSlug;
  return guides.find((guide) => guide.toolSlug === slug);
}

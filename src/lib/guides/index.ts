import type { Guide } from './types';
import { pdfToolsThatDontUpload } from './5-pdf-tools-that-dont-upload-your-files';
import { howToAddPageNumbersToPdf } from './how-to-add-page-numbers-to-pdf';
import { howToAddWatermarkToPdf } from './how-to-add-watermark-to-pdf';
import { howToCompressPdf } from './how-to-compress-pdf';
import { howToConvertJpgToPdf } from './how-to-convert-jpg-to-pdf';
import { howToConvertPdfToJpg } from './how-to-convert-pdf-to-jpg';
import { howToConvertPdfToMarkdown } from './how-to-convert-pdf-to-markdown';
import { howToConvertDocxToMarkdown } from './how-to-convert-docx-to-markdown';
import { howToConvertXlsxToMarkdown } from './how-to-convert-xlsx-to-markdown';
import { howToExtractPagesFromPdf } from './how-to-extract-pages-from-pdf';
import { howToMergePdf } from './how-to-merge-pdf';
import { howToOrganizePdfPages } from './how-to-organize-pdf-pages';
import { howToPasswordProtectPdf } from './how-to-password-protect-pdf';
import { howToRemovePagesFromPdf } from './how-to-remove-pages-from-pdf';
import { howToRotatePdf } from './how-to-rotate-pdf';
import { howToSplitPdf } from './how-to-split-pdf';
import { howToUnlockPdf } from './how-to-unlock-pdf';

/**
 * Central guide registry, in display order. Guides are Korean-only and are
 * rendered at /guides/<slug>/; the sitemap and both guide routes derive from
 * this list, so adding a guide here is enough to publish it.
 */
export const guides: Guide[] = [
  howToMergePdf,
  howToSplitPdf,
  howToCompressPdf,
  howToRotatePdf,
  howToOrganizePdfPages,
  howToRemovePagesFromPdf,
  howToExtractPagesFromPdf,
  howToConvertPdfToJpg,
  howToConvertJpgToPdf,
  howToPasswordProtectPdf,
  howToUnlockPdf,
  howToAddWatermarkToPdf,
  howToAddPageNumbersToPdf,
  howToConvertPdfToMarkdown,
  howToConvertDocxToMarkdown,
  howToConvertXlsxToMarkdown,
  pdfToolsThatDontUpload,
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

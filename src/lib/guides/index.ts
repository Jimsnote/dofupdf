import type { Guide } from './types';
import { howToPasswordProtectPdf } from './how-to-password-protect-pdf';
import { howToUnlockPdf } from './how-to-unlock-pdf';

/**
 * Central guide registry, in display order. Guides are Japanese long-form
 * tutorials rendered at /guides/<slug>/; the sitemap and both guide routes
 * derive from this list, so adding a guide here is enough to publish it.
 *
 * W1 consolidation: only the two password guides stay published. The other
 * guide data files remain in this folder (code is kept, unpublished) and
 * return 410 via src/worker/index.js.
 */
export const guides: Guide[] = [howToPasswordProtectPdf, howToUnlockPdf];

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

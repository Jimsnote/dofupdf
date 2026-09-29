/** A single image slot inside a guide section (screenshot, diagram). */
export interface GuideImage {
  /** Absolute public path, e.g. '/guides/how-to-merge-pdf/step-1.png'. */
  src: string;
  alt: string;
}

/** One content section of the detailed walkthrough. */
export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  image?: GuideImage;
}

/** A short headed block of paragraphs (alternatives, edge cases). */
export interface GuideBlock {
  heading: string;
  paragraphs: string[];
}

export interface GuideFaq {
  q: string;
  a: string;
}

/**
 * A guide is pure data: components/pages/guides/GuidePage.tsx renders it into
 * a full tutorial page. Guides are Korean-only, live at /guides/<slug>/, and
 * carry no localized alternates.
 *
 * Copy conventions: paragraphs, quick steps and intro support inline links
 * written as [label](/path/) — always site-relative, always with a trailing
 * slash. Keep every factual claim in sync with the real tool behavior.
 */
export interface Guide {
  /** URL slug, e.g. 'how-to-merge-pdf'. */
  slug: string;
  /** Slug of the tool this guide belongs to (lib/tools.ts), if any. */
  toolSlug: string | null;
  /** H1 of the page; the route appends ' | DofuPDF' for the meta title. */
  title: string;
  /** Meta description, <= 160 chars. */
  description: string;
  /** Direct-answer opening paragraph (60-80 words), doubles as a GEO summary. */
  intro: string;
  /** Four-step quick answer; mirrors the real tool UI, feeds HowTo JSON-LD. */
  quickSteps: string[];
  /** Detailed walkthrough sections (3-4 per guide). */
  sections: GuideSection[];
  /** Other ways to do the same job (Preview, Acrobat, ...), 2-3 sentences each. */
  alternatives: GuideBlock[];
  /** Common problems and how to work around them. */
  edgeCases: GuideBlock[];
  /** 4-6 Q&As; rendered as an accordion and as FAQPage JSON-LD. */
  faqs: GuideFaq[];
  /** Slugs of related guides; entries not (yet) in the registry are skipped. */
  related: string[];
}

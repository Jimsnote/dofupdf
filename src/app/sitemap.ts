import type { MetadataRoute } from 'next';
import { defaultLocale, locales } from '@/i18n/config';
import { compares } from '@/lib/compare';
import { guides } from '@/lib/guides';
import { localizedUrl } from '@/lib/seo';
import { tools } from '@/lib/tools';

export const dynamic = 'force-static';

const staticPaths = ['', '/about', '/privacy', '/terms', '/faq', '/tools', '/pdf-password', '/pricing', '/tokushoho'];

/**
 * lastmod には実際の内容更新日を使う（F9）。`new Date()`（ビルド日時）は
 * デプロイのたび全 URL を偽装更新するため禁止。内容を実際に変えたとき
 * だけ、この表を手で更新する。ガイドは各データファイルの
 * dateModified/datePublished が正（この表より優先）。
 */
const CONTENT_DATES: Record<string, string> = {
  '': '2026-10-28',
  '/about': '2026-10-28',
  '/privacy': '2026-10-28',
  '/terms': '2026-10-28',
  '/faq': '2026-10-28',
  '/tools': '2026-10-28',
  '/pdf-password': '2026-10-28',
  '/pricing': '2026-10-28',
  '/tokushoho': '2026-11-02',
  '/protect-pdf': '2026-10-28',
  '/unlock-pdf': '2026-10-28',
  '/guides': '2026-11-01',
  '/compare': '2026-10-28',
  '/compare/dofupdf-vs-ilovepdf': '2026-10-28',
  '/compare/dofupdf-vs-smallpdf': '2026-10-28',
  '/compare/dofupdf-vs-sejda': '2026-10-28',
};

/** Live tool pages, derived from the central registry. */
const toolPaths = tools
  .filter((tool) => tool.status === 'live')
  .map((tool) => `/${tool.slug}`);

const paths = [...staticPaths, ...toolPaths];

function contentDate(path: string): string {
  return CONTENT_DATES[path] ?? '2026-10-28';
}

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const path of paths) {
    const languages: Record<string, string> = {};
    for (const l of locales) {
      languages[l] = localizedUrl(l, path);
    }
    languages['x-default'] = localizedUrl(defaultLocale, path);

    const isTool = toolPaths.includes(path);

    for (const locale of locales) {
      entries.push({
        url: localizedUrl(locale, path),
        lastModified: contentDate(path),
        changeFrequency: path === '' || isTool ? 'weekly' : 'monthly',
        priority: path === '' ? 1 : isTool ? 0.9 : 0.8,
        alternates: { languages },
      });
    }
  }

  // Japanese-only guides (index + one URL per registered guide), derived from
  // the registry. No hreflang alternates: guides have no localized versions.
  for (const path of ['/guides', ...guides.map((guide) => `/guides/${guide.slug}`)]) {
    const guide = guides.find((g) => `/guides/${g.slug}` === path);
    entries.push({
      url: localizedUrl(defaultLocale, path),
      lastModified: guide?.dateModified ?? guide?.datePublished ?? contentDate(path),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  // Japanese-only compare pages, derived from the registry.
  const comparePaths = ['/compare', ...compares.map((compare) => `/compare/${compare.slug}`)];
  for (const path of comparePaths) {
    entries.push({
      url: localizedUrl(defaultLocale, path),
      lastModified: contentDate(path),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  return entries;
}

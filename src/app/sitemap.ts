import type { MetadataRoute } from 'next';
import { defaultLocale, locales } from '@/i18n/config';
import { compares } from '@/lib/compare';
import { guides } from '@/lib/guides';
import { localizedUrl } from '@/lib/seo';
import { tools } from '@/lib/tools';

export const dynamic = 'force-static';

const staticPaths = ['', '/about', '/privacy', '/terms', '/faq'];

/** Live tool pages, derived from the central registry. */
const toolPaths = tools
  .filter((tool) => tool.status === 'live')
  .map((tool) => `/${tool.slug}`);

const paths = [...staticPaths, ...toolPaths];

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
        // No lastModified: a build-time `new Date()` would change every
        // deploy, which search engines learn to distrust.
        changeFrequency: path === '' || isTool ? 'weekly' : 'monthly',
        priority: path === '' ? 1 : isTool ? 0.9 : 0.8,
        alternates: { languages },
      });
    }
  }

  // Korean-only guides (index + one URL per registered guide), derived from
  // the registry. No hreflang alternates: guides have no localized versions.
  const guidePaths = ['/guides', ...guides.map((guide) => `/guides/${guide.slug}`)];
  for (const path of guidePaths) {
    entries.push({
      url: localizedUrl(defaultLocale, path),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  // Korean-only compare pages, derived from the registry.
  const comparePaths = ['/compare', ...compares.map((compare) => `/compare/${compare.slug}`)];
  for (const path of comparePaths) {
    entries.push({
      url: localizedUrl(defaultLocale, path),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  return entries;
}

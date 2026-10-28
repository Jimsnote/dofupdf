import { SITE_URL } from '@/lib/site';
import { JsonLd } from './JsonLd';

export interface BreadcrumbEntry {
  name: string;
  /** Site-relative path with leading and trailing slash, e.g. '/guides/'. */
  path: string;
}

/**
 * BreadcrumbList JSON-LD. Keep the entries in sync with the page's visible
 * breadcrumb trail (or its logical position when no trail is rendered).
 */
export function BreadcrumbJsonLd({ items }: { items: BreadcrumbEntry[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
  return <JsonLd data={data} />;
}

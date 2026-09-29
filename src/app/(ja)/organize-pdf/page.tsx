import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { OrganizePdfPage } from '@/components/pages/tools/OrganizePdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/organize-pdf',
    dict.toolPages['organize-pdf'].metaTitle,
    dict.toolPages['organize-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <OrganizePdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}

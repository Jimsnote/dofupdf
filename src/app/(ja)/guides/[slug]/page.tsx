import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ogLocales } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { getGuide, guides } from '@/lib/guides';
import { OG_IMAGE_URL } from '@/lib/seo';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { SiteShell } from '@/components/layout/SiteShell';
import { GuidePage } from '@/components/pages/guides/GuidePage';

const locale = 'ja' as const;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const title = `${guide.title} | ${SITE_NAME}`;
  // The site is Korean-only: self-referencing canonical, no hreflang cluster.
  const canonical = `${SITE_URL}/guides/${guide.slug}/`;
  return {
    title,
    description: guide.description,
    alternates: { canonical },
    openGraph: {
      title,
      description: guide.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: ogLocales[locale],
      type: 'article',
      images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: guide.description,
      images: [OG_IMAGE_URL],
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <GuidePage guide={guide} />
    </SiteShell>
  );
}

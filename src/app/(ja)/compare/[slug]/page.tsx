import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDictionary } from '@/i18n/get-dictionary';
import { compares, getCompare } from '@/lib/compare';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { ComparePage } from '@/components/pages/compare/ComparePage';

const locale = 'ja' as const;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return compares.map((compare) => ({ slug: compare.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const compare = getCompare(slug);
  if (!compare) notFound();
  return pageMetadata(locale, `/compare/${slug}`, compare.title, compare.description);
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const compare = getCompare(slug);
  if (!compare) notFound();
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <ComparePage compare={compare} />
    </SiteShell>
  );
}

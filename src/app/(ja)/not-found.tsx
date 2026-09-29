import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';
import { NotFoundContent } from '@/components/layout/NotFoundContent';

export const metadata: Metadata = {
  title: `Page not found | ${SITE_NAME}`,
};

export default function NotFound() {
  return <NotFoundContent />;
}

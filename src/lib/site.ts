/** Central, overridable site constants. */
export const SITE_NAME = 'DofuPDF';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dofupdf.com'
).replace(/\/$/, '');

export const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? 'https://github.com/Jimsnote/dofupdf';

export const CONTACT_EMAIL = 'support@dofupdf.com';

export const CF_ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN ?? '';

export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '';

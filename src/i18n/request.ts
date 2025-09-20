// src/i18n/request.ts
import {getRequestConfig} from 'next-intl/server';

type Messages = Record<string, Record<string, unknown>>;

const ALL_NAMESPACES = [
  'common',
  'landing',
  'login',
  'register',
  'dashboard',
  'prelaunch'
];

async function loadMessages(locale: string, namespaces: string[]): Promise<Messages> {
  const out: Messages = {};
  await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const mod = await import(`../messages/${locale}/${ns}.json`);
        out[ns] = (mod as any).default ?? mod;
      } catch {
        const fallback = await import(`../messages/en/${ns}.json`);
        out[ns] = (fallback as any).default ?? fallback;
      }
    })
  );
  return out;
}

// NOTE: In next-intl v3 only { locale } is passed here
export default getRequestConfig(async ({locale}) => {
  const messages = await loadMessages(locale, ALL_NAMESPACES);
  return {locale, messages};
});

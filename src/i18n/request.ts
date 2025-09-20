// src/i18n/request.ts
import {getRequestConfig} from 'next-intl/server';

type Messages = Record<string, Record<string, unknown>>;

const ALL_NAMESPACES = [
  'common',
  'landing',
  'login',
  'register',
  'dashboard',
  'prelaunch' // <- keep only this for the prelaunch page (no dotted namespaces)
];

async function loadMessages(locale: string, namespaces: string[]): Promise<Messages> {
  const out: Messages = {};
  await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const mod = await import(`../messages/${locale}/${ns}.json`);
        (out as any)[ns] = (mod as any).default ?? mod;
      } catch {
        const fallback = await import(`../messages/en/${ns}.json`);
        (out as any)[ns] = (fallback as any).default ?? fallback;
      }
    })
  );
  return out;
}

// next-intl v3: only { locale } is available
export default getRequestConfig(async ({locale}) => {
  const messages = await loadMessages(locale, ALL_NAMESPACES);
  return {locale, messages};
});

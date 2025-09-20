// src/i18n/request.ts
import {getRequestConfig} from 'next-intl/server';

type Messages = Record<string, Record<string, unknown>>;

/** Map URL prefixes to the message namespaces that page needs */
const ROUTE_NAMESPACES: Record<string, string[]> = {
  '/': ['landing', 'common'],
  '/login': ['login', 'common'],
  '/register': ['register', 'common'],
  '/dashboard': ['dashboard', 'common'],
  '/train/prelaunch': ['prelaunch', 'common']
};

/** Decide which namespaces to load for a given path */
function namespacesFor(path: string): string[] {
  const clean = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  for (const [prefix, nss] of Object.entries(ROUTE_NAMESPACES)) {
    if (clean === prefix || clean.startsWith(prefix + '/')) {
      // Ensure "common" is always present once
      return Array.from(new Set([...nss, 'common']));
    }
  }
  return ['common'];
}

/** Load JSON for the given locale + namespaces; fall back to EN if missing */
async function loadMessages(
  locale: string,
  namespaces: string[]
): Promise<Messages> {
  const out: Messages = {};
  await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const mod = await import(`../messages/${locale}/${ns}.json`);
        out[ns] = (mod as any).default ?? mod;
      } catch {
        try {
          const mod = await import(`../messages/en/${ns}.json`);
          out[ns] = (mod as any).default ?? mod;
        } catch {
          out[ns] = {};
        }
      }
    })
  );
  return out;
}

/** Export the Next-Intl request config */
export default getRequestConfig(async ({locale, request}) => {
  // Strip the locale prefix (/en|/hi|/ta) from the URL so we can match the route
  const path =
    request.nextUrl?.pathname?.replace(/^\/(en|hi|ta)(?=\/|$)/, '') || '/';

  const namespaces = namespacesFor(path);
  const messages = await loadMessages(locale, namespaces);

  // IMPORTANT: return both `locale` and `messages`
  return {locale, messages};
});

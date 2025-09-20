import {getRequestConfig} from 'next-intl/server';

/**
 * We load only the namespaces needed for each route,
 * BUT we also merge in your old big file (src/messages/<locale>.json) as a fallback.
 * That way, nothing breaks while you gradually split files.
 */

const ROUTE_NAMESPACES: Array<[RegExp, string[]]> = [
  [/^\/dashboard$/, ['dashboard']],
  [/^\/train\/prelaunch$/, ['prelaunch', 'prelaunch.gamma']],
  [/^\/login$/, ['login']],
  [/^\/register$/, ['register']],
  // Everything else gets 'common'
  [/.*/, ['common']]
];

async function safeImport<T = any>(path: string): Promise<T | {}> {
  try {
    const mod = await import(path);
    // JSON default export
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (mod as any).default ?? mod;
  } catch {
    return {};
  }
}

async function loadNamespaces(locale: string, namespaces: string[]) {
  const out: Record<string, unknown> = {};
  for (const ns of namespaces) {
    const msg = await safeImport<Record<string, unknown>>(
      `../messages/${locale}/${ns}.json`
    );
    Object.assign(out, msg); // files are shaped like { "<ns>": {...} }
  }
  return out;
}

export default getRequestConfig(async ({locale, request}) => {
  // Remove /en, /hi, /ta from the beginning so we can match the path
  const path = request.nextUrl.pathname.replace(/^\/(en|hi|ta)(?=\/|$)/, '') || '/';

  // Figure out which namespaces this route needs
  const needed = ROUTE_NAMESPACES
    .filter(([rx]) => rx.test(path))
    .flatMap(([, list]) => list);

  // Always include 'common' at least
  if (!needed.includes('common')) needed.push('common');

  // 1) Try to load per-page files (new way)
  const perPage = await loadNamespaces(locale, needed);

  // 2) Fallback: load your old big file if it exists (old way)
  const bigFile = await safeImport<Record<string, unknown>>(
    `../messages/${locale}.json`
  );

  // Merge: page files override big file
  const messages = {...bigFile, ...perPage};

  return {messages};
});

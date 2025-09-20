export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import "../globals.css";
import { Inter } from "next/font/google";
import ClientProviders from "./providers";
import LocaleSwitcher from "@/components/LocaleSwitcher";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata() {
  return {
    title: "NuVantage India",
    description: "Build your India wellness franchise network",
  };
}

const SUPPORTED = ["en", "hi", "ta"];

async function loadMessages(locale) {
  const lang = SUPPORTED.includes(locale) ? locale : "en";
  try {
    const mod = await import(`../../messages/${lang}.json`);
    return mod.default || mod;
  } catch (_e) {
    // Fallback to English if file missing or JSON parse fails
    const en = await import(`../../messages/en.json`);
    return en.default || en;
  }
}

export default async function RootLayout({ children, params }) {
  const locale = (params?.locale || "en").toLowerCase();
  const activeLocale = SUPPORTED.includes(locale) ? locale : "en";
  const messages = await loadMessages(activeLocale);

  return (
    <html lang={activeLocale} className={inter.className}>
      <body className="bg-white text-gray-900 antialiased">
        {/* Client-side providers (next-intl, etc.) */}
        <ClientProviders locale={activeLocale} messages={messages}>
          {children}

          {/* Floating language switcher (can be hidden via env/query/localStorage) */}
          <LocaleSwitcher />
        </ClientProviders>
      </body>
    </html>
  );
}

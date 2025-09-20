export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import "../globals.css";
import { Inter } from "next/font/google";
import ClientProviders from "./providers";

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
  const messages = await loadMessages(locale);

  return (
    <html lang={SUPPORTED.includes(locale) ? locale : "en"} className={inter.className}>
      <body className="bg-white text-gray-900 antialiased">
        {/* All client-side hooks & translations live below */}
        <ClientProviders locale={SUPPORTED.includes(locale) ? locale : "en"} messages={messages}>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}

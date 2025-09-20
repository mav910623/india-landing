import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";

/**
 * Supported locales
 */
export const locales = ["en", "hi", "ta"];
export const defaultLocale = "en";

/**
 * Generate static params for locales (needed by Next.js App Router)
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * Root layout
 */
export default async function RootLayout({ children, params }) {
  const locale = params?.locale || defaultLocale;

  if (!locales.includes(locale)) {
    notFound();
  }

  let messages;
  try {
    messages = (await import(`../messages/${locale}.json`)).default;
  } catch (error) {
    console.error(`No messages for locale "${locale}"`, error);
    messages = (await import(`../messages/${defaultLocale}.json`)).default;
  }

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

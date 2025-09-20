import "../../globals.css";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";

export const locales = ["en", "hi", "ta"];
export const defaultLocale = "en";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }) {
  const locale = params?.locale || defaultLocale;

  if (!locales.includes(locale)) {
    notFound();
  }

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch (error) {
    console.error(`No messages for locale "${locale}"`, error);
    messages = (await import(`../../messages/${defaultLocale}.json`)).default;
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

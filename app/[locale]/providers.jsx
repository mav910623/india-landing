"use client";

import { NextIntlClientProvider } from "next-intl";

/**
 * ClientProviders
 * Wraps the app with NextIntlClientProvider using messages passed from the server layout.
 * This avoids server crashes and keeps RSC clean.
 */
export default function ClientProviders({ children, locale, messages }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

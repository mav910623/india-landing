// app/layout.js
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import "./globals.css";

export const metadata = {
  title: "NuVantage India",
  description: "Build your India wellness franchise network",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}

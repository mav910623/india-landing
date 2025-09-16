// app/layout.js
import "./globals.css";

export const metadata = {
  title: {
    default: "NuVantage India",
    template: "%s | NuVantage India",
  },
  description:
    "NuVantage India Dashboard — Build · Duplicate · Multiply your team with clarity and elegance.",
  themeColor: "#1e3a8a", // Indigo-900
  openGraph: {
    title: "NuVantage India",
    description:
      "Build · Duplicate · Multiply — grow your team with NuVantage India.",
    url: "https://your-vercel-domain.vercel.app", // update with your live domain
    siteName: "NuVantage India",
    images: [
      {
        url: "/og-nuvantage.png",
        width: 1200,
        height: 630,
        alt: "NuVantage India Dashboard",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NuVantage India",
    description:
      "Build · Duplicate · Multiply — grow your team with NuVantage India.",
    images: ["/og-nuvantage.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "48x48" },
      { url: "/nuvantage-icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.png"],
  },
  applicationName: "NuVantage India",
  manifest: "/site.webmanifest",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="bg-white"

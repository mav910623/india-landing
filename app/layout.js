// app/layout.js
import "./globals.css";

export const metadata = {
  title: {
    default: "NuVantage India",
    template: "%s | NuVantage India",
  },
  description:
    "NuVantage India Dashboard — build, duplicate, and multiply your team with clarity and elegance.",
  themeColor: "#1e3a8a",
  openGraph: {
    title: "NuVantage India",
    description:
      "Build, Duplicate, Multiply — grow your team with NuVantage India.",
    url: "https://your-vercel-domain.vercel.app", // update with your real domain
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
      "Build, Duplicate, Multiply — grow your team with NuVantage India.",
    images: ["/og-nuvantage.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/nuvantage-icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  applicationName: "NuVantage India",
  manifest: "/site.webmanifest",
};

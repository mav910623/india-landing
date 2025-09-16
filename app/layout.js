// app/layout.js
import "./globals.css";

export const metadata = {
  title: {
    default: "NuVantage India",
    template: "%s | NuVantage India",
  },
  description:
    "NuVantage India Dashboard — build, duplicate, and multiply your team with clarity and elegance.",
  themeColor: "#1e3a8a", // deep indigo
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

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="bg-white">
      <body>{children}</body>
    </html>
  );
}

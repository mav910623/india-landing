/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Helpful perf tweak (optional): trims bundle for these libs
  experimental: {
    optimizePackageImports: ["@tanstack/react-virtual"]
  },

  async redirects() {
    return [
      // Default root → English locale
      { source: "/", destination: "/en", permanent: false },

      // Top-level routes → English equivalents
      { source: "/login", destination: "/en/login", permanent: false },
      { source: "/register", destination: "/en/register", permanent: false },
      { source: "/dashboard", destination: "/en/dashboard", permanent: false },
      { source: "/my-team", destination: "/en/my-team", permanent: false },

      // Training center (catch sub-pages too)
      { source: "/train", destination: "/en/train", permanent: false },
      { source: "/train/:slug*", destination: "/en/train/:slug*", permanent: false }
    ];
  },

  async headers() {
    return [
      // Cache static assets aggressively
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      },
      // Cache images in /public (tweak as you like)
      {
        source: "/:all*(svg|png|jpg|jpeg|gif|webp|ico|avif)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      }
    ];
  }
};

export default nextConfig;

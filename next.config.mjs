// next.config.mjs
import createNextIntlPlugin from "next-intl/plugin";

// Tell the plugin where your intl config lives
const withNextIntl = createNextIntlPlugin("./next-intl.config.js");

export default withNextIntl({
  reactStrictMode: true
  // You don’t need experimental.appDir in Next 15 (App Router is default)
});

"use client";

import {useEffect, useMemo, useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {useLocale, useTranslations} from "next-intl";

/**
 * Floating Locale Switcher
 *
 * Visibility controls (any of these will hide it):
 *  - Build-time:   NEXT_PUBLIC_SHOW_LOCALE_SWITCHER=false
 *  - Runtime:      ?hideLocale=1
 *  - One-click:    close (×) button — persists in localStorage
 *
 * Re-enable after closing:
 *  - Run in console: localStorage.removeItem('hideLocaleSwitcher')
 *  - Or add ?hideLocale=0 to any URL
 */
export default function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("common.lang");

  // Labels with safe fallbacks so we never break UI if a key is missing
  const locales = useMemo(
    () => [
      {code: "en", label: safeT(t, "en", "English")},
      {code: "hi", label: safeT(t, "hi", "Hindi")},
      {code: "ta", label: safeT(t, "ta", "Tamil")}
    ],
    [t]
  );

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 1) Build-time default via ENV (defaults true)
    const envDefault =
      (process.env.NEXT_PUBLIC_SHOW_LOCALE_SWITCHER ?? "true").toString().toLowerCase() !== "false";

    // 2) LocalStorage override
    const lsHide = typeof window !== "undefined" && localStorage.getItem("hideLocaleSwitcher") === "1";

    // 3) Query param override
    let qpOverride = null;
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const hv = sp.get("hideLocale");
      if (hv === "1") qpOverride = false; // means hide
      if (hv === "0") qpOverride = true;  // means show + clear LS
      if (hv === "0") localStorage.removeItem("hideLocaleSwitcher");
      if (hv === "1") localStorage.setItem("hideLocaleSwitcher", "1");
    }

    const finalVisible = qpOverride ?? (envDefault && !lsHide);
    setVisible(finalVisible);
  }, []);

  if (!visible) return null;

  function switchTo(target) {
    if (!target || target === locale) return;
    const newPath = buildPathWithLocale(pathname, target);
    const qs = params?.toString();
    router.push(qs ? `${newPath}?${qs}` : newPath);
  }

  function handleClose() {
    try {
      localStorage.setItem("hideLocaleSwitcher", "1");
    } catch {}
    setVisible(false);
  }

  return (
    <div
      role="group"
      aria-label={safeT(t, "label", "Language")}
      className="fixed z-50 bottom-3 right-3 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur px-2 py-1 shadow-lg flex items-center gap-1 text-xs"
    >
      {/* Close */}
      <button
        aria-label={safeT(t, "hide", "Hide")}
        title={safeT(t, "hide", "Hide")}
        onClick={handleClose}
        className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100"
      >
        ×
      </button>

      {locales.map((l) => {
        const active = l.code === locale;
        return (
          <button
            key={l.code}
            onClick={() => switchTo(l.code)}
            aria-current={active ? "true" : "false"}
            title={`${safeT(t, "label", "Language")}: ${l.label}`}
            className={[
              "rounded-xl px-2.5 py-1 transition",
              active
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-gray-800 hover:bg-gray-50 border border-gray-200"
            ].join(" ")}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

/* Helpers */
function buildPathWithLocale(pathname, target) {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (parts.length === 0) return `/${target}`;
  const first = parts[0];
  if (["en", "hi", "ta"].includes(first)) {
    parts[0] = target;
    return `/${parts.join("/")}`;
  }
  return `/${target}/${parts.join("/")}`;
}
function safeT(t, key, fallback) {
  try {
    const val = t(key);
    return typeof val === "string" ? val : fallback;
  } catch {
    return fallback;
  }
}

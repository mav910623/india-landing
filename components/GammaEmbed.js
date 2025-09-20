"use client";

import {useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";

/**
 * GammaEmbed
 * - Uses i18n if available
 * - Safe fallbacks for missing keys (open/tip/title/src)
 */
export default function GammaEmbed({ src, title, ratio = 16 / 9 }) {
  const t = useTranslations("prelaunch.gamma");
  const boxRef = useRef(null);
  const [height, setHeight] = useState(0);

  // Derive *labels* with graceful fallbacks if a message is missing
  const rawTitle = safeT(t, "title", "Prelaunch Overview (Slides)");
  const openLabel = safeT(t, "open", "Open in new tab");
  const tipLabel  = safeT(t, "tip",  "Tip: Click “Open in new tab” if you want fullscreen.");
  const missingMsg = tHas(t, "missingSrc")
    ? t.rich("missingSrc", {
        code: (c) => <span className="font-mono">{c}</span>,
        strong: (c) => <strong>{c}</strong>
      })
    : "Slides link is missing. Ask your sponsor.";

  // Consider it "missing" if src is empty OR looks like a fallback key
  const isMissingSrc =
    !src ||
    /^prelaunch(\.|:)/.test(String(src)) || // e.g. "prelaunch.gamma.src"
    /^prelaunch\.gamma\./.test(String(src));

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const recalc = () => {
      const w = el.clientWidth || 800;
      setHeight(Math.round(w / ratio));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);

  if (isMissingSrc) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {missingMsg}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="w-full">
      {/* Action row */}
      <div className="mb-2 flex items-center justify-end">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 shadow-sm"
          title={openLabel}
          aria-label={openLabel}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M14 3h7v7M21 3l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M21 14v5a2 2 0 0 1-2 2h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {openLabel}
        </a>
      </div>

      {/* Embed */}
      <div
        className="rounded-3xl overflow-hidden border border-gray-100 shadow-xl bg-white"
        style={{ height }}
      >
        <iframe
          src={src}
          title={title || rawTitle}
          className="w-full h-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen; clipboard-read; clipboard-write"
        />
      </div>

      {/* Tip */}
      <div className="mt-2 text-xs text-gray-500">
        {tipLabel}
      </div>
    </div>
  );
}

/** Helpers: next-intl returns the key when missing; detect & fallback */
function safeT(t, key, fallback) {
  try {
    const val = t(key);
    if (typeof val !== "string") return fallback;
    // Missing messages typically echo back something like "prelaunch.gamma.key"
    if (val.startsWith("prelaunch.") || val.startsWith("prelaunch:")) return fallback;
    return val;
  } catch {
    return fallback;
  }
}

function tHas(t, key) {
  try {
    const val = t(key);
    return typeof val === "string" && !val.startsWith("prelaunch.");
  } catch {
    return false;
  }
}

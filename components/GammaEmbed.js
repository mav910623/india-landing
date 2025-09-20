"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * GammaEmbed
 * Responsive iframe wrapper for Gamma decks (or any external slides).
 *
 * Props:
 * - src (string): the Gamma share URL (required)
 * - title (string): accessible title for the iframe (optional; falls back to i18n)
 * - ratio (number): aspect ratio width/height (default 16/9)
 */
export default function GammaEmbed({ src, title, ratio = 16 / 9 }) {
  const t = useTranslations("prelaunch.gamma");
  const boxRef = useRef(null);
  const [height, setHeight] = useState(0);

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

  if (!src) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {t.rich("missingSrc", {
          code: (c) => <span className="font-mono">{c}</span>,
          strong: (c) => <strong>{c}</strong>
        })}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="w-full">
      <div
        className="rounded-3xl overflow-hidden border border-gray-100 shadow-xl bg-white"
        style={{ height }}
      >
        <iframe
          src={src}
          title={title || t("title")}
          className="w-full h-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen; clipboard-read; clipboard-write"
        />
      </div>
      <div className="mt-2 text-xs text-gray-500">{t("tip")}</div>
    </div>
  );
}

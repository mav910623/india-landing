"use client";

import {useEffect, useRef, useState} from "react";

/**
 * GammaEmbed (no i18n inside)
 * Props:
 * - src (string)       : deck URL (required)
 * - title (string)     : iframe title (optional)
 * - ratio (number)     : width/height (default 16/9)
 * - missingText (node) : what to show if src is missing
 * - tipText (string)   : small hint text under the frame
 */
export default function GammaEmbed({ src, title, ratio = 16 / 9, missingText, tipText }) {
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
        {missingText || "Slides link is missing."}
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
          title={title || "Slides"}
          className="w-full h-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen; clipboard-read; clipboard-write"
        />
      </div>
      {!!tipText && <div className="mt-2 text-xs text-gray-500">{tipText}</div>}
    </div>
  );
}

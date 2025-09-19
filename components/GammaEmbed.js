"use client";

import { useEffect, useRef, useState } from "react";

/**
 * GammaEmbed
 * Responsive iframe wrapper for Gamma decks (or any external slides).
 *
 * Props:
 * - src (string): the Gamma share URL (required)
 * - title (string): accessible title for the iframe
 * - ratio (number): aspect ratio width/height (default 16/9)
 */
export default function GammaEmbed({ src, title = "India Story Slides", ratio = 16 / 9 }) {
  const boxRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!boxRef.current) return;
    const recalc = () => {
      const w = boxRef.current.clientWidth || 800;
      setHeight(Math.round(w / ratio));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [ratio]);

  if (!src) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Missing <span className="font-mono">src</span> for <strong>GammaEmbed</strong>. Add your Gamma share URL.
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
          title={title}
          className="w-full h-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen; clipboard-read; clipboard-write"
        />
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Tip: Rotate your phone to landscape for larger slides.
      </div>
    </div>
  );
}

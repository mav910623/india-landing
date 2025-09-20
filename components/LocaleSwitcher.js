"use client";

import {useEffect, useMemo, useState} from "react";
import {useLocale, useMessages} from "next-intl";
import {usePathname, useRouter, useSearchParams} from "next/navigation";

const STORAGE_KEY = "nv.lang.hidden";

function getMsg(messages, path, fallback) {
  // Safe, no exceptions if the key is missing
  try {
    const parts = path.split(".");
    let cur = messages;
    for (const p of parts) cur = cur?.[p];
    if (typeof cur === "string") return cur;
  } catch {}
  return fallback;
}

export default function LocaleSwitcher({floating = true, align = "right"}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const locale = useLocale();
  const messages = useMessages();

  const [hidden, setHidden] = useState(false);

  // Read initial hidden state
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
  }, []);

  // Escape hatches: ?showLang=1 or Alt+L to force-show
  useEffect(() => {
    if (searchParams?.get("showLang") === "1") {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setHidden(false);
    }
    const onKey = (e) => {
      if (e.altKey && (e.key === "l" || e.key === "L")) {
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
        setHidden(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchParams]);

  const locales = useMemo(() => ["en", "hi", "ta"], []);
  const labels = {
    en: getMsg(messages, "common.locale.en", "English"),
    hi: getMsg(messages, "common.locale.hi", "हिन्दी"),
    ta: getMsg(messages, "common.locale.ta", "தமிழ்")
  };
  const title = getMsg(messages, "common.switcher.title", "Language");
  const hideText = getMsg(messages, "common.switcher.hide", "Hide");

  function createNextPath(target) {
    const seg = pathname.split("/");
    if (["en", "hi", "ta"].includes(seg[1])) seg[1] = target;
    else seg.splice(1, 0, target);
    const qs = searchParams?.toString();
    return qs ? `${seg.join("/")}?${qs}` : seg.join("/");
  }

  function switchTo(next) {
    router.push(createNextPath(next));
  }

  if (!floating) {
    // Inline variant (e.g., in a header)
    return (
      <div className="inline-flex items-center gap-1">
        {locales.map((l) => (
          <button
            key={l}
            onClick={() => switchTo(l)}
            aria-pressed={locale === l}
            className={`px-2 py-1 rounded border text-sm ${
              locale === l
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200"
            }`}
          >
            {labels[l]}
          </button>
        ))}
      </div>
    );
  }

  if (hidden) return null;

  // Floating variant
  return (
    <div className={`fixed ${align === "left" ? "left-3" : "right-3"} bottom-3 z-[60]`}>
      <div className="rounded-2xl border border-gray-200 bg-white/90 backdrop-blur px-2 py-2 shadow-lg flex items-center gap-1">
        <span className="text-xs text-gray-600 px-1">{title}:</span>
        {locales.map((l) => (
          <button
            key={l}
            onClick={() => switchTo(l)}
            aria-pressed={locale === l}
            className={`text-xs px-2 py-1 rounded-lg border ${
              locale === l
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-800"
            }`}
          >
            {labels[l]}
          </button>
        ))}
        <button
          onClick={() => {
            try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
            setHidden(true);
          }}
          title={hideText}
          aria-label={hideText}
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}

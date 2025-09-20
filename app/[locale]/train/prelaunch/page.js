"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import GammaEmbed from "@/components/GammaEmbed";
import { useTranslations, useLocale } from "next-intl";

/** Utility */
function percentDone(map, total) {
  const done = Array.from({ length: total }).reduce(
    (n, _, i) => (map[String(i)] ? n + 1 : n),
    0
  );
  return Math.round((done / total) * 100);
}

export default function PrelaunchTrainingPage() {
  const t = useTranslations("prelaunch");
  const locale = useLocale();
  const router = useRouter();

  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Firestore-backed progress
  const [stepMap, setStepMap] = useState({});
  const [moduleDone, setModuleDone] = useState(false);

  // Auth boot (locale-aware redirect)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return router.push(`/${locale}/login`);
      setUid(u.uid);
    });
    return () => unsub();
  }, [router, locale]);

  // Load progress
  useEffect(() => {
    if (!uid) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        const m0 = data?.training?.prelaunch?.m0 || {};
        setStepMap(m0.steps || {});
        setModuleDone(!!m0.done);
      } catch (e) {
        console.error(e);
        setError(t("errors.load"));
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, t]);

  // Steps (from i18n)
  const steps = useMemo(
    () => [
      t("steps.0"),
      t("steps.1"),
      t("steps.2"),
      t("steps.3"),
      t("steps.4"),
    ],
    [t]
  );

  const pct = useMemo(() => percentDone(stepMap, steps.length), [stepMap, steps.length]);

  // Save steps
  async function saveSteps(nextMap) {
    if (!uid) return;
    setSaving(true);
    setError("");
    try {
      const ref = doc(db, "users", uid);
      await setDoc(
        ref,
        {
          training: {
            prelaunch: {
              m0: {
                steps: nextMap,
                done: false,
                updatedAt: serverTimestamp(),
              },
            },
          },
        },
        { merge: true }
      );
    } catch (e) {
      console.error(e);
      setError(t("errors.save"));
    } finally {
      setSaving(false);
    }
  }

  // Mark done
  async function markModuleDone() {
    if (!uid) return;
    setSaving(true);
    setError("");
    try {
      const ref = doc(db, "users", uid);
      await updateDoc(ref, {
        "training.prelaunch.m0.done": true,
        "training.prelaunch.m0.updatedAt": serverTimestamp(),
      });
      setModuleDone(true);
    } catch (e) {
      console.error(e);
      setError(t("errors.update"));
    } finally {
      setSaving(false);
    }
  }

  // Toggle step
  function toggleStep(i) {
    const key = String(i);
    const next = { ...stepMap, [key]: !stepMap[key] };
    setStepMap(next);
    saveSteps(next);
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-white">
        <p className="text-sm text-gray-600">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      {/* Background ornaments */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute -bottom-16 -right-24 h-72 w-72 rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        {/* Brand header */}
        <div className="mb-6 sm:mb-8 flex items-center justify-center">
          <div className="rounded-2xl ring-1 ring-gray-100 shadow-sm p-3 bg-white">
            <Image
              src="/nuvantage-icon.svg"
              alt={t("brandAlt")}
              width={84}
              height={84}
              priority
              className="block"
            />
          </div>
        </div>

        {/* Hero */}
        <header className="rounded-3xl border border-gray-100/80 bg-white/80 backdrop-blur-sm p-6 sm:p-7 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                {t("subtitle")}
              </p>
            </div>
            <div className="shrink-0">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${
                  moduleDone
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
                {moduleDone ? t("chip.completed") : t("chip.progress", { pct })}
              </span>
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 border border-amber-200">
              {error}
            </div>
          )}
        </header>

        {/* Gamma deck */}
        <section className="mt-6 rounded-3xl border border-gray-100/80 bg-white/90 backdrop-blur-sm p-3 sm:p-4 shadow-xl">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
            {t("slides.title")}
          </h2>
          <GammaEmbed
            src={t("gamma.src")}
            title={t("gamma.title")}
            tipText={t("gamma.tip")}
            missingText={t.rich("gamma.missingSrc", {
              code: (c) => <span className="font-mono">{c}</span>,
              strong: (c) => <strong>{c}</strong>
            })}
          />
        </section>

        {/* Checklist */}
        <section className="mt-6 rounded-3xl border border-gray-100/80 bg-white/90 backdrop-blur-sm p-4 sm:p-6 shadow-xl">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">
            {t("checklist.title")}
          </h2>

          <ul className="mt-3 divide-y divide-gray-100">
            {steps.map((label, i) => {
              const checked = !!stepMap[String(i)];
              return (
                <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                  <button
                    onClick={() => toggleStep(i)}
                    className={`w-full text-left flex items-start gap-3 rounded-2xl border p-3 transition shadow-sm ${
                      checked
                        ? "bg-green-50 border-green-200"
                        : "bg-white hover:bg-gray-50 border-gray-200"
                    }`}
                    aria-pressed={checked}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-semibold ${
                        checked
                          ? "bg-green-600 border-green-600 text-white"
                          : "bg-white border-gray-300 text-gray-400"
                      }`}
                      aria-hidden="true"
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <span className={`text-sm ${checked ? "text-gray-900" : "text-gray-800"}`}>
                      <span className="font-semibold mr-1">{i + 1}.</span> {label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Mark complete */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              onClick={markModuleDone}
              disabled={saving || moduleDone}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm transition active:scale-[0.99] ${
                moduleDone
                  ? "bg-gray-100 text-gray-600 cursor-default"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
              title={moduleDone ? t("btn.alreadyDoneTitle") : t("btn.markDoneTitle")}
            >
              {moduleDone ? t("btn.completed") : t("btn.markDone")}
            </button>

            <span className="text-xs text-gray-500">
              {t("savedHint")}
            </span>
          </div>
        </section>

        {/* Footer nav */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <a
            href={`/${locale}/dashboard`}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 shadow-sm"
          >
            ← {t("backDashboard")}
          </a>

          <div className="flex items-center gap-2">
            <a
              href={`/${locale}/train/sponsor`}
              className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 hover:bg-blue-100 shadow-sm"
            >
              {t("postLaunchCta")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

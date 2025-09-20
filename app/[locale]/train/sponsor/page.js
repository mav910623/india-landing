"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

/** ─────────────────────────────────────────────────────────
 * Page config (CSR-safe)
 * ───────────────────────────────────────────────────────── */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** ─────────────────────────────────────────────────────────
 * Content
 * ───────────────────────────────────────────────────────── */
const YT_ID = "hwBUMOZQVRk"; // Getting Started video (YouTube)
const STEPS = [
  "Set a simple goal for the next 30 days.",
  "Write your name list (start with 30–50 people).",
  "Sort the list: A (hot), B (warm), C (cold).",
  "Block a daily Power Hour in your calendar.",
  "Invite simply (two lines max) to meet or watch.",
  "Present the plan (keep it short and friendly).",
  "Use A-B-C: Add value, Bridge, Connect to upline or tools.",
  "Follow up within 24 hours (be kind, be clear).",
  "Enroll and help their first order.",
  "Duplicate Day 1 with your new partner.",
];

function percentDone(map) {
  const total = STEPS.length;
  const done = STEPS.reduce((n, _, i) => (map[String(i)] ? n + 1 : n), 0);
  return Math.round((done / total) * 100);
}

/** ─────────────────────────────────────────────────────────
 * Main
 * ───────────────────────────────────────────────────────── */
export default function SponsorTrainingPage() {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Firestore-backed progress
  const [stepMap, setStepMap] = useState({}); // {"0":true, ...}
  const [moduleDone, setModuleDone] = useState(false);

  // Auth boot
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUid(u.uid);
    });
    return () => unsub();
  }, [router]);

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
        const m1 = data?.training?.sponsor?.m1 || {};
        setStepMap(m1.steps || {});
        setModuleDone(!!m1.done);
      } catch (e) {
        console.error(e);
        setError("Could not load your training progress.");
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  const pct = useMemo(() => percentDone(stepMap), [stepMap]);

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
            sponsor: {
              m1: {
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
      setError("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function markModuleDone() {
    if (!uid) return;
    setSaving(true);
    setError("");
    try {
      const ref = doc(db, "users", uid);
      await updateDoc(ref, {
        "training.sponsor.m1.done": true,
        "training.sponsor.m1.updatedAt": serverTimestamp(),
      });
      setModuleDone(true);
    } catch (e) {
      console.error(e);
      setError("Could not update. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function toggleStep(i) {
    const key = String(i);
    const next = { ...stepMap, [key]: !stepMap[key] };
    setStepMap(next);
    // Fire-and-forget UX, persisted in background
    saveSteps(next);
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-white">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      {/* Ornaments */}
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
              alt="NuVantage India"
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
                Learn How to Sponsor
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Quick video + 10 easy steps. Do them, tick them, and you’re rolling.
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
                {moduleDone ? "Module Completed" : `Progress: ${pct}%`}
              </span>
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 border border-amber-200">
              {error}
            </div>
          )}
        </header>

        {/* Video card */}
        <section className="mt-6 rounded-3xl border border-gray-100/80 bg-white/90 backdrop-blur-sm p-3 sm:p-4 shadow-xl">
          <div className="relative rounded-2xl overflow-hidden ring-1 ring-gray-200">
            {/* subtle frame gradient */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
            {/* 16:9 wrapper without tailwind plugin */}
            <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
              <iframe
                title="Getting Started — Learn How to Sponsor"
                src={`https://www.youtube-nocookie.com/embed/${YT_ID}?rel=0&modestbranding=1`}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>

          <div className="mt-3 sm:mt-4 rounded-2xl bg-gray-50 border border-gray-200 p-3 sm:p-4">
            <h3 className="text-sm font-semibold text-gray-900">What this video covers</h3>
            <p className="mt-1 text-sm text-gray-700">
              How to start fast, who to talk to, what to say, and how to link people to help so they can
              say “yes” with confidence.
            </p>
          </div>
        </section>

        {/* 10 Steps */}
        <section className="mt-6 rounded-3xl border border-gray-100/80 bg-white/90 backdrop-blur-sm p-4 sm:p-6 shadow-xl">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">10 simple steps</h2>

          <ul className="mt-3 divide-y divide-gray-100">
            {STEPS.map((label, i) => {
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
              title={moduleDone ? "Already completed" : "Mark Module 1 as done"}
            >
              {moduleDone ? "Module Completed" : "Mark Module as Done"}
            </button>

            <span className="text-xs text-gray-500">
              Your ticks are saved automatically. You can come back anytime.
            </span>
          </div>
        </section>

        {/* Action plan (next 48 hours) */}
        <section className="mt-6 rounded-3xl border border-gray-100/80 bg-white/90 backdrop-blur-sm p-4 sm:p-6 shadow-xl">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">Your next 48 hours</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold text-blue-800 mb-1">Today</div>
              <ul className="text-sm text-blue-900 list-disc pl-4 space-y-1.5">
                <li>Write your first 30 names.</li>
                <li>Sort A / B / C.</li>
                <li>Book a 60-min Power Hour.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold text-emerald-800 mb-1">Tomorrow</div>
              <ul className="text-sm text-emerald-900 list-disc pl-4 space-y-1.5">
                <li>Invite 5 people (simple two-line invite).</li>
                <li>Lock one presentation slot.</li>
                <li>Tell your upline your plan.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold text-amber-800 mb-1">Day 3</div>
              <ul className="text-sm text-amber-900 list-disc pl-4 space-y-1.5">
                <li>Present once (live or video).</li>
                <li>Follow up within 24 hours.</li>
                <li>Enroll one new partner or customer.</li>
              </ul>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-600">
            Tip: Keep it kind and short. Use A-B-C to connect people to help (upline, meetings, tools).
          </p>
        </section>

        {/* Footer nav */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 shadow-sm"
          >
            ← Back to Dashboard
          </a>

          <div className="flex items-center gap-2">
            <a
              href="/train/sponsor#"
              className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 hover:bg-blue-100 shadow-sm"
            >
              Getting Started
            </a>
            <a
              href="/train/sponsor#module-2"
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 shadow-sm"
            >
              Opportunity & Product
            </a>
            <a
              href="/train/sponsor#module-3"
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 shadow-sm"
            >
              How to do A-B-C
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

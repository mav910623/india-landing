"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

/** Ensure CSR */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** --------------------------
 *  Firestore helpers
 * ------------------------- */
async function ensureTrainingDoc(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  // If user doc doesn't exist yet (edge case), create a minimal one
  if (!snap.exists()) {
    await setDoc(ref, {
      uid,
      createdAt: serverTimestamp(),
      training: {
        sponsor: {
          gettingStarted: { watched: false, done: false },
          oppPresentation: { done: false },
          abc: { done: false },
          updatedAt: serverTimestamp(),
        },
      },
    });
    return {
      training: {
        sponsor: {
          gettingStarted: { watched: false, done: false },
          oppPresentation: { done: false },
          abc: { done: false },
        },
      },
    };
  }

  const data = snap.data() || {};
  const training = data.training || {};
  const sponsor = training.sponsor || {};
  // Seed missing fields (forward compatible)
  const merged = {
    gettingStarted: { watched: false, done: false, ...(sponsor.gettingStarted || {}) },
    oppPresentation: { done: false, ...(sponsor.oppPresentation || {}) },
    abc: { done: false, ...(sponsor.abc || {}) },
  };

  // If something was missing, persist the merge
  if (
    !sponsor.gettingStarted ||
    sponsor.oppPresentation === undefined ||
    sponsor.abc === undefined
  ) {
    await updateDoc(ref, {
      "training.sponsor": {
        ...merged,
        updatedAt: serverTimestamp(),
      },
    });
  }

  return { training: { sponsor: merged } };
}

async function setSponsorProgress(uid, path, value) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, {
    [`training.sponsor.${path}`]: value,
    "training.sponsor.updatedAt": serverTimestamp(),
  });
}

/** --------------------------
 *  Page
 * ------------------------- */
export default function SponsorTrainingPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);

  const [progress, setProgress] = useState({
    gettingStarted: { watched: false, done: false },
    oppPresentation: { done: false },
    abc: { done: false },
  });

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);
      setDisplayName(user.displayName || "India Founder");
      const seeded = await ensureTrainingDoc(user.uid);
      setProgress(seeded?.training?.sponsor || progress);
      setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const pct = useMemo(() => {
    const total = 3;
    const done =
      (progress.gettingStarted?.done ? 1 : 0) +
      (progress.oppPresentation?.done ? 1 : 0) +
      (progress.abc?.done ? 1 : 0);
    return Math.round((done / total) * 100);
  }, [progress]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-white">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  /** UI helpers */
  const mark = async (key, value) => {
    if (!uid) return;
    const next = { ...progress, [key]: { ...(progress[key] || {}), ...value } };
    setProgress(next); // optimistic
    await setSponsorProgress(uid, key, next[key]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      {/* Soft ornaments */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute -bottom-16 -right-24 h-72 w-72 rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        {/* Brand header */}
        <div className="mb-6 sm:mb-8 flex flex-col items-center text-center">
          <div className="rounded-2xl ring-1 ring-gray-100 shadow-sm p-3 bg-white">
            <Image
              src="/nuvantage-icon.svg"
              alt="NuVantage India"
              width={96}
              height={96}
              priority
              className="block"
            />
          </div>
          <h1 className="mt-4 text-[22px] sm:text-3xl font-semibold tracking-tight text-gray-900">
            Learn How to Sponsor
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Hey {displayName}! Follow these 3 simple modules. Keep it easy, keep it fun.
          </p>

          {/* Progress pill */}
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm">
            <span className="font-semibold">{pct}%</span> complete
          </div>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-gray-100/80 bg-white/80 backdrop-blur-sm p-5 sm:p-7 shadow-xl space-y-6">
          {/* Module 1 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  1) Getting Started
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Watch this. Then do the tiny steps below. Simple.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={!!progress.gettingStarted?.done}
                  onChange={(e) => mark("gettingStarted", { done: e.target.checked })}
                />
                Mark done
              </label>
            </div>

            {/* Video */}
            <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl ring-1 ring-gray-100 shadow-sm bg-black">
              <iframe
                title="Getting Started — Sponsoring"
                src="https://www.youtube.com/embed/hwBUMOZQVRk"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full"
                onLoad={() => mark("gettingStarted", { watched: true })}
              />
            </div>

            {/* Super-simple summary */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <h3 className="text-sm font-semibold text-blue-900">Big idea (kid-friendly)</h3>
                <ul className="mt-2 list-disc pl-5 text-sm text-blue-900 space-y-1.5">
                  <li>Use the products yourself. Be your own proof.</li>
                  <li>Write a small list of friends. Don’t guess who will say “yes”.</li>
                  <li>Invite kindly. Share, don’t push.</li>
                  <li>It’s okay if someone says “not now”. Keep going.</li>
                </ul>
                {/* Transcript citation (required) */}
                <p className="sr-only">
                  Source: training talk transcript. :contentReference[oaicite:0]{index=0}
                </p>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <h3 className="text-sm font-semibold text-emerald-900">Do these 5 tiny steps</h3>
                <ol className="mt-2 list-decimal pl-5 text-sm text-emerald-900 space-y-1.5">
                  <li>Pick your starter products and use them.</li>
                  <li>Write your <strong>Top 20</strong> names (family, friends, coworkers, neighbors).</li>
                  <li>Circle 3 names and message them today.</li>
                  <li>Set a quick goal: become a <strong>Brand Representative</strong>.</li>
                  <li>Book your next training / big event with your upline.</li>
                </ol>
              </div>
            </div>

            <details className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
              <summary className="cursor-pointer select-none font-semibold">
                Why these steps work
              </summary>
              <ul className="mt-2 list-disc pl-5 space-y-1.5">
                <li>Products first → you have a real story to share.</li>
                <li>Name list stops guessing → you invite more, worry less.</li>
                <li>3 reach-outs a day → tiny daily wins beat big bursts.</li>
                <li>Brand Rep goal → gives you a clear “first finish line”.</li>
                <li>Events & classes → faster skills, stronger belief.</li>
              </ul>
            </details>
          </section>

          {/* Module 2 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  2) Opportunity & Product Presentation
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Learn to show the plan and 1–2 hero products. Keep it short and friendly.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={!!progress.oppPresentation?.done}
                  onChange={(e) => mark("oppPresentation", { done: e.target.checked })}
                />
                Mark done
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-gray-700">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <h3 className="font-semibold">Say this (simple script)</h3>
                <p className="mt-1">
                  “I’m working on something new that helps people look and feel great.
                  Can I show you a quick 10-minute idea and 2 products I like?”
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <h3 className="font-semibold">Your mini deck</h3>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li>1 slide: Why now (health/beauty/opportunity)</li>
                  <li>2 slides: Your story + product results</li>
                  <li>1 slide: How to start (simple pack + support)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Module 3 */}
          <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  3) How to do A-B-C
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  A = Value Add (meeting/upline/tools) · B = Bridge (you) · C = Customer/Prospect.
                  Your job: connect C to A.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={!!progress.abc?.done}
                  onChange={(e) => mark("abc", { done: e.target.checked })}
                />
                Mark done
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-gray-700">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <h3 className="font-semibold">Quick example</h3>
                <p className="mt-1">
                  “Can I introduce you to my mentor for 10 minutes? They can answer your questions
                  and show what to do first.”
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <h3 className="font-semibold">Best practices</h3>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li>Set the time and purpose clearly.</li>
                  <li>Hype the value of A (why it helps).</li>
                  <li>Stay in the chat; learn how your mentor answers.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Footer CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Back to Dashboard
            </a>
            <p className="text-xs text-gray-500">
              Your progress is saved automatically. Keep it simple. Do a little each day.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

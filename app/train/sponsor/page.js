"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
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

/* --------------------------- Firestore helpers --------------------------- */

const EMPTY_PROGRESS = {
  gettingStarted: { watched: false, done: false },
  oppPresentation: { done: false },
  abc: { done: false },
};

function normalizeProgress(sponsor) {
  return {
    gettingStarted: {
      watched: false,
      done: false,
      ...(sponsor?.gettingStarted || {}),
    },
    oppPresentation: {
      done: false,
      ...(sponsor?.oppPresentation || {}),
    },
    abc: {
      done: false,
      ...(sponsor?.abc || {}),
    },
  };
}

async function ensureTrainingDoc(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid,
      createdAt: serverTimestamp(),
      training: {
        sponsor: { ...EMPTY_PROGRESS, updatedAt: serverTimestamp() },
      },
    });
    return { training: { sponsor: { ...EMPTY_PROGRESS } } };
  }

  const data = snap.data() || {};
  const merged = normalizeProgress(data?.training?.sponsor);

  // If anything was missing, persist the merge
  if (
    !data?.training?.sponsor?.gettingStarted ||
    data?.training?.sponsor?.oppPresentation === undefined ||
    data?.training?.sponsor?.abc === undefined
  ) {
    await updateDoc(ref, {
      "training.sponsor": { ...merged, updatedAt: serverTimestamp() },
    });
  }

  return { training: { sponsor: merged } };
}

async function setSponsorProgress(uid, key, nextPartial) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, {
    [`training.sponsor.${key}`]: nextPartial,
    "training.sponsor.updatedAt": serverTimestamp(),
  });
}

/* ----------------------------- UI helpers ----------------------------- */

function DoneButton({ done, onToggle, label = "Mark as done" }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!!done}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium shadow-sm border transition
      ${done
          ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
          : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
        }`}
      title={done ? "Marked as done" : "Mark this module as done"}
    >
      {done ? (
        <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
          <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0 text-gray-500">
          <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5c0-1.1-.9-2-2-2Zm0 16H5V5h14v14Z" />
        </svg>
      )}
      <span>{done ? "Done" : label}</span>
    </button>
  );
}

function MiniCheck({ children }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 inline-block h-4 w-4 rounded-full bg-blue-600 text-white grid place-items-center text-[10px]">✓</span>
      <span>{children}</span>
    </li>
  );
}

/* --------------------------------- Page --------------------------------- */

export default function SponsorTrainingPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [displayName, setDisplayName] = useState("India Founder");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUid(user.uid);
      setDisplayName(user.displayName || "India Founder");
      try {
        const seeded = await ensureTrainingDoc(user.uid);
        setProgress(normalizeProgress(seeded?.training?.sponsor));
      } catch (e) {
        console.error(e);
        setErrMsg("Couldn’t load your training progress. Please refresh.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
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

  /** Optimistic state update + Firestore write */
  const mark = async (key, partial) => {
    if (!uid) return;
    setErrMsg("");
    const next = {
      ...progress,
      [key]: { ...(progress[key] || {}), ...partial },
    };
    setProgress(next); // optimistic
    try {
      await setSponsorProgress(uid, key, next[key]);
    } catch (e) {
      console.error(e);
      setErrMsg("Saving failed. You can retry in a moment.");
      try {
        const seeded = await ensureTrainingDoc(uid);
        setProgress(normalizeProgress(seeded?.training?.sponsor));
      } catch {}
    }
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
            Hi {displayName}! Follow these 3 simple modules. Keep it short, friendly, and consistent.
          </p>

          {/* Progress pill */}
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm">
            <span className="font-semibold">{pct}%</span> complete
          </div>

          {errMsg && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {errMsg}
            </div>
          )}
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
                  Watch this first, then do the small steps below.
                </p>
              </div>
              <DoneButton
                done={!!progress.gettingStarted?.done}
                onToggle={() =>
                  mark("gettingStarted", { done: !progress.gettingStarted?.done })
                }
                label="Mark as done"
              />
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

            {/* Clean, simple guidance */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <h3 className="text-sm font-semibold text-blue-900">Know this</h3>
                <ul className="mt-2 text-sm text-blue-900 space-y-1.5">
                  <MiniCheck>Use the products yourself. Your story matters.</MiniCheck>
                  <MiniCheck>Write a small name list. Don’t pre-judge.</MiniCheck>
                  <MiniCheck>Invite with care. Share, don’t push.</MiniCheck>
                  <MiniCheck>“Not now” is okay. Keep moving.</MiniCheck>
                </ul>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <h3 className="text-sm font-semibold text-emerald-900">Do this now</h3>
                <ol className="mt-2 list-decimal pl-5 text-sm text-emerald-900 space-y-1.5">
                  <li>Pick and start using 1–2 products.</li>
                  <li>Write your <strong>Top 20</strong> names.</li>
                  <li>Message 3 people today to say hello and share interest.</li>
                  <li>Set a first goal: become a <strong>Brand Representative</strong>.</li>
                  <li>Book a class/event with your upline.</li>
                </ol>
              </div>

              <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                <h3 className="text-sm font-semibold text-violet-900">Try this message</h3>
                <p className="mt-2 text-sm text-violet-900">
                  “Hey! I’ve started something simple that helps people look/feel great. Could I share a
                  10-minute idea and two products I like? If it’s not for you, no worries.”
                </p>
              </div>
            </div>

            <details className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
              <summary className="cursor-pointer select-none font-semibold">
                Why it works
              </summary>
              <ul className="mt-2 list-disc pl-5 space-y-1.5">
                <li>Products first → you speak from experience.</li>
                <li>Name list → more invites, less guessing.</li>
                <li>3 reach-outs/day → tiny wins add up fast.</li>
                <li>Brand Rep goal → a clear first finish line.</li>
                <li>Events/classes → fast skill growth with support.</li>
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
                  Share the plan + 1–2 hero products. Keep it short and friendly.
                </p>
              </div>
              <DoneButton
                done={!!progress.oppPresentation?.done}
                onToggle={() =>
                  mark("oppPresentation", { done: !progress.oppPresentation?.done })
                }
                label="Mark as done"
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-gray-700">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <h3 className="font-semibold">Simple script</h3>
                <p className="mt-1">
                  “I’m working on something that helps people look and feel great.
                  Can I show you a quick 10-minute idea and two products I like?”
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <h3 className="font-semibold">Mini deck outline</h3>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li>Why now (health/beauty/opportunity)</li>
                  <li>Your story + product results</li>
                  <li>How to start (simple pack + support)</li>
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
                  A = Value Add (meeting/upline/tools) · B = Bridge (you) · C = Customer.
                  Your job: connect C to A.
                </p>
              </div>
              <DoneButton
                done={!!progress.abc?.done}
                onToggle={() => mark("abc", { done: !progress.abc?.done })}
                label="Mark as done"
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-gray-700">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <h3 className="font-semibold">Quick example</h3>
                <p className="mt-1">
                  “Can I introduce you to my mentor for 10 minutes?
                  They can answer your questions and show what to do first.”
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <h3 className="font-semibold">Best practices</h3>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li>Set time and purpose clearly.</li>
                  <li>Explain why the mentor or tool will help.</li>
                  <li>Stay in the chat; learn from the answers.</li>
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
              Your progress saves automatically. Do a little each day.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

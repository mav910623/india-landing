"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/** =========================================================
 *  Simple content (kid-friendly)
 * ======================================================== */
const MODULES = [
  {
    id: "m1",
    num: 1,
    title: "Getting Started",
    goal: "Make a small list and invite people nicely.",
    steps: [
      "Think happy. Be kind. Keep it simple.",
      "Write 20 names you know. Friends and family are okay.",
      "Invite: “I found something good. 15 minutes to see?”",
    ],
  },
  {
    id: "m2",
    num: 2,
    title: "Show the Chance & Products",
    goal: "Explain what it is in a few minutes.",
    steps: [
      "Why now: India is starting. Good timing.",
      "How to grow: Build → Duplicate → Multiply.",
      "Share 2–3 hero products. Talk about results, not big words.",
    ],
  },
  {
    id: "m3",
    num: 3,
    title: "ABC: Connect People to Help",
    goal: "A = a helpful thing, B = you connect, C = your friend.",
    steps: [
      "A = a meeting, an upline, or a short recording.",
      "B = you say a few words to link them.",
      "C = your friend. Book the next step within 24 hours.",
    ],
  },
];

/** Local storage key (per-user when we have uid) */
const lsKey = (uid) => `nuvtg.learn.progress:${uid || "anon"}`;

/** Small helpers */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** =========================================================
 *  Page
 * ======================================================== */
export default function SponsorTrainingPage() {
  const [uid, setUid] = useState(null);
  const [progress, setProgress] = useState({}); // { m1: true/false, ... }
  const [expanded, setExpanded] = useState(MODULES[0].id);
  const [saving, setSaving] = useState(false);

  const firstRender = useRef(true);
  const saveTimer = useRef(null);

  /** Capture current user for Firestore sync */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUid(u?.uid || null);
    });
    return () => unsub();
  }, []);

  /** Load progress (local first, then Firestore if logged in) */
  useEffect(() => {
    // 1) local
    try {
      const raw = localStorage.getItem(lsKey(uid));
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object") setProgress(saved);
      }
    } catch {}

    // 2) firestore
    (async () => {
      if (!uid) return;
      try {
        const snap = await getDoc(doc(db, "users", uid));
        const data = snap.data() || {};
        const modules = data?.learn?.modules || {};
        if (modules && typeof modules === "object") {
          setProgress((prev) => ({ ...prev, ...modules })); // merge local + remote
        }
      } catch (e) {
        console.warn("Learn progress fetch failed:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  /** Persist on change: local immediately, Firestore debounced */
  useEffect(() => {
    // local
    try {
      localStorage.setItem(lsKey(uid), JSON.stringify(progress || {}));
    } catch {}

    // debounce remote
    if (!uid) return; // not logged in => local only
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSaving(true);
        await setDoc(
          doc(db, "users", uid),
          { learn: { modules: progress || {}, updatedAt: serverTimestamp() } },
          { merge: true }
        );
      } catch (e) {
        console.warn("Learn progress save failed:", e);
      } finally {
        setSaving(false);
      }
    }, 350);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [progress, uid]);

  const doneCount = useMemo(
    () => MODULES.reduce((n, m) => n + (progress[m.id] ? 1 : 0), 0),
    [progress]
  );
  const totalCount = MODULES.length;
  const pct = clamp(Math.round((doneCount / totalCount) * 100), 0, 100);

  const nextModule = useMemo(
    () => MODULES.find((m) => !progress[m.id]),
    [progress]
  );

  const toggleDone = (id) => {
    setProgress((p) => ({ ...p, [id]: !p[id] }));
  };

  const openOnly = (id) => setExpanded(id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      {/* ornaments */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute -bottom-16 -right-24 h-72 w-72 rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="rounded-2xl ring-1 ring-gray-100 shadow-sm p-3 bg-white">
            <Image
              src="/nuvantage-icon.svg"
              alt="NuVantage India"
              width={88}
              height={88}
              priority
              className="block"
            />
          </div>
          <h1 className="mt-4 text-[22px] sm:text-3xl font-semibold tracking-tight text-gray-900">
            Learn to Sponsor
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Three small lessons. Easy steps. You can do this.
          </p>
        </div>

        {/* Top progress + actions */}
        <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
              {doneCount}/{totalCount}
            </span>
            <span className="font-medium">{pct}% done</span>
            {saving && <span className="text-xs text-gray-500">· saving…</span>}
          </div>

          <div className="flex-1" />

          {nextModule && (
            <button
              onClick={() => openOnly(nextModule.id)}
              className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 transition"
              title="Go to the next lesson"
            >
              Resume lesson {nextModule.num}
            </button>
          )}

          <Link
            href="/dashboard"
            className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            title="Back to dashboard"
          >
            ← Back
          </Link>
        </div>

        {/* Modules */}
        <div className="space-y-3">
          {MODULES.map((m) => {
            const open = expanded === m.id;
            const done = !!progress[m.id];
            return (
              <section
                key={m.id}
                className="rounded-3xl border border-gray-100/80 bg-white/80 backdrop-blur-sm p-4 sm:p-5 shadow-xl"
              >
                {/* Header */}
                <button
                  onClick={() => openOnly(m.id)}
                  aria-expanded={open}
                  className="w-full text-left flex items-center gap-3"
                >
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                      done ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {m.num}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                        {m.title}
                      </h2>
                      {done && (
                        <span className="text-[11px] rounded-full border border-green-200 bg-green-50 text-green-700 px-2 py-0.5">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">{m.goal}</p>
                  </div>
                  <span
                    className={`ml-2 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    ▼
                  </span>
                </button>

                {/* Body */}
                {open && (
                  <div className="mt-4 pl-11">
                    <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-800">
                      {m.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => toggleDone(m.id)}
                        className={`rounded-2xl px-4 py-2 text-sm font-semibold transition shadow-sm border ${
                          done
                            ? "bg-green-600 text-white hover:bg-green-700 border-green-600"
                            : "bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                        }`}
                      >
                        {done ? "Mark as Not Done" : "Mark as Done"}
                      </button>

                      {!done && m.id === "m1" && (
                        <Link
                          href="/dashboard"
                          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                          title="Copy your referral link on the dashboard"
                        >
                          Ready to invite? Go to Dashboard
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Tiny footer tip */}
        <p className="mt-6 text-center text-xs text-gray-500">
          Tip: small steps every day win the game.
        </p>
      </div>
    </div>
  );
}

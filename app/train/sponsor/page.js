"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/** =========================================================
 * Runtime hints
 * =======================================================*/
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** =========================================================
 * Firestore helpers
 * =======================================================*/
const SP_DOC_PATH = (uid: string) => doc(db, "users", uid, "training", "sponsor");

async function ensureDoc(uid: string) {
  const ref = SP_DOC_PATH(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { modules: {}, items: {}, updatedAt: serverTimestamp() }, { merge: true });
  }
}

async function loadState(uid: string) {
  const ref = SP_DOC_PATH(uid);
  const snap = await getDoc(ref);
  return snap.exists()
    ? (snap.data() as { modules?: Record<string, boolean>; items?: Record<string, boolean> })
    : { modules: {}, items: {} };
}

async function saveState(uid: string, next: { modules?: any; items?: any }) {
  const ref = SP_DOC_PATH(uid);
  await setDoc(
    ref,
    { ...(next || {}), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** =========================================================
 * Tiny UI atoms
 * =======================================================*/
function SectionHeader({ k, title, done }: { k: string; title: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-xl text-[11px] font-bold
        ${done ? "bg-green-100 text-green-700 ring-1 ring-green-200" : "bg-blue-100 text-blue-700 ring-1 ring-blue-200"}`}>
        {k}
      </span>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
    </div>
  );
}

function DoneButton({
  checked,
  onChange,
  labelDone = "Marked done",
  labelTodo = "Mark as done",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelDone?: string;
  labelTodo?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`group relative inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition
      ${checked
        ? "bg-green-600 text-white shadow-sm hover:bg-green-700"
        : "bg-blue-600 text-white shadow-sm hover:bg-blue-700"}`}
      aria-pressed={checked}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white transition
        ${checked ? "scale-100" : "scale-90 opacity-90"}`}
      >
        {/* check icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" className={`${checked ? "text-green-600" : "text-blue-600"}`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <span>{checked ? labelDone : labelTodo}</span>
    </button>
  );
}

/** A prettier YouTube embed with a soft frame & aspect ratio */
function YouTubeFrame({ id, title }: { id: string; title: string }) {
  return (
    <div className="relative">
      <div
        className="aspect-video rounded-3xl bg-white shadow-xl ring-1 ring-gray-100 overflow-hidden"
        style={{
          background:
            "radial-gradient(1200px 200px at 50% -20%, rgba(37,99,235,0.08), rgba(255,255,255,0)), radial-gradient(1200px 180px at 50% 120%, rgba(99,102,241,0.08), rgba(255,255,255,0))",
        }}
      >
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&color=white`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>{title}</span>
        <a
          href={`https://www.youtube.com/watch?v=${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 hover:bg-gray-50"
          title="Open on YouTube"
        >
          Open on YouTube
          <svg width="14" height="14" viewBox="0 0 24 24" className="text-gray-500" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 3h7v7" />
            <path d="M10 14L21 3" />
            <path d="M21 14v7h-7" />
          </svg>
        </a>
      </div>
    </div>
  );
}

/** =========================================================
 * Page
 * =======================================================*/
export default function SponsorTrainingPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // progress state
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<Record<string, boolean>>({});

  // boot auth + load progress
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUid(u.uid);
      setName(u.displayName || "India Founder");
      await ensureDoc(u.uid);
      const st = await loadState(u.uid);
      setModules(st.modules || {});
      setItems(st.items || {});
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const percent = useMemo(() => {
    const keys = ["m1:video", "m1:actions", "m2:basics", "m3:abc"];
    const done = keys.filter((k) => items[k]).length;
    return Math.round((done / keys.length) * 100);
  }, [items]);

  async function toggleItem(key: string, value: boolean) {
    if (!uid) return;
    setSaving(true);
    const next = { ...items, [key]: value };
    setItems(next);
    await saveState(uid, { items: next });
    setSaving(false);
  }

  async function markModule(key: string, value: boolean) {
    if (!uid) return;
    setSaving(true);
    const next = { ...modules, [key]: value };
    setModules(next);
    await saveState(uid, { modules: next });
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-white">
        <p className="text-sm text-gray-500">Loading training…</p>
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

      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        {/* Brand header */}
        <div className="mb-6 sm:mb-8 flex flex-col items-center text-center">
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
          <h1 className="mt-4 text-[22px] sm:text-3xl font-semibold tracking-tight text-gray-900">
            Learn How to Sponsor
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Hi {name}. This page shows the simple steps to get your first wins.
          </p>

          {/* Progress pill */}
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Progress: <strong>{percent}%</strong></span>
            {saving && <span className="text-gray-400">· saving…</span>}
          </div>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-gray-100/80 bg-white/90 backdrop-blur-sm p-6 sm:p-7 shadow-xl space-y-8">
          {/* Module 1 */}
          <section>
            <SectionHeader k="1" title="Getting Started" done={modules["m1"]} />
            <p className="mt-2 text-sm text-gray-600">
              Start here. Watch the short video, then do the tiny actions below.
            </p>

            <div className="mt-4">
              <YouTubeFrame id="hwBUMOZQVRk" title="Getting Started — Training" />
              <div className="mt-3">
                <DoneButton
                  checked={!!items["m1:video"]} onChange={(v) => toggleItem("m1:video", v)}
                  labelTodo="I watched it"
                  labelDone="Watched"
                />
              </div>
            </div>

            {/* Friendly, simple, transcript-driven ideas */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <h4 className="text-sm font-semibold text-blue-900">Big ideas from the video</h4>
                <ul className="mt-2 list-disc pl-5 text-sm text-blue-900/90 space-y-1.5">
                  <li>Know your reason for doing this and keep it simple.</li>
                  <li>Make a small name list first (friends & family you care about).</li>
                  <li>Talk to people daily — short and friendly.</li>
                  <li>Use your team and tools; you don’t have to explain everything.</li>
                  <li>Keep going — small actions every day build momentum.</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <h4 className="text-sm font-semibold text-emerald-900">Action steps</h4>
                <ol className="mt-2 list-decimal pl-5 text-sm text-emerald-900/90 space-y-1.5">
                  <li>Write 20–30 names you want to help.</li>
                  <li>Pick 3 names for today. Say hello and set a quick catch-up.</li>
                  <li>Schedule your first team call to learn the basics.</li>
                  <li>Share one tool (video/meeting) with at least 1 person.</li>
                  <li>Repeat tomorrow. Small steps win.</li>
                </ol>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <DoneButton
                checked={!!items["m1:actions"]} onChange={(v) => toggleItem("m1:actions", v)}
                labelTodo="I did these steps"
                labelDone="Steps done"
              />
              <button
                type="button"
                onClick={() => markModule("m1", true)}
                className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition
                ${modules["m1"] ? "bg-green-100 text-green-800 ring-1 ring-green-200" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}
              >
                {modules["m1"] ? "Module marked complete" : "Mark module complete"}
              </button>
            </div>
          </section>

          <div className="border-t border-gray-100" />

          {/* Module 2 */}
          <section>
            <SectionHeader k="2" title="Opportunity & Product Presentation" done={modules["m2"]} />
            <p className="mt-2 text-sm text-gray-600">
              Keep it short and clear. Share the overview and a simple product story. Use your
              upline and recorded tools to help you.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-gray-900">What to cover</h4>
                <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1.5">
                  <li>What this is, who it’s for, and why it works.</li>
                  <li>How someone can get started quickly.</li>
                  <li>One or two products you personally like and why.</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-gray-900">Tips</h4>
                <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1.5">
                  <li>Keep it under 10 minutes if you can.</li>
                  <li>Use a tool (short video/slide) to do the heavy lifting.</li>
                  <li>End with a simple, friendly next step (see Module 3).</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <DoneButton
                checked={!!items["m2:basics"]} onChange={(v) => toggleItem("m2:basics", v)}
                labelTodo="I’m ready to present"
                labelDone="Ready"
              />
              <button
                type="button"
                onClick={() => markModule("m2", true)}
                className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition
                ${modules["m2"] ? "bg-green-100 text-green-800 ring-1 ring-green-200" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}
              >
                {modules["m2"] ? "Module marked complete" : "Mark module complete"}
              </button>
            </div>
          </section>

          <div className="border-t border-gray-100" />

          {/* Module 3 */}
          <section>
            <SectionHeader k="3" title="How to do A-B-C" done={modules["m3"]} />
            <p className="mt-2 text-sm text-gray-600">
              ABC means: <strong>A</strong>dd value (a meeting, mentor, or tool),{" "}
              <strong>B</strong>ridge (connect them together), and <strong>C</strong>onnect (your prospect).
              You are not the expert — you are the friendly guide.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
                <h4 className="text-sm font-semibold text-purple-900">A — Add Value</h4>
                <p className="mt-2 text-sm text-purple-900/90">
                  Use something helpful: a short video, a live Zoom, or a quick upline intro.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <h4 className="text-sm font-semibold text-amber-900">B — Bridge</h4>
                <p className="mt-2 text-sm text-amber-900/90">
                  Set up the connection and explain briefly why it’s useful for them.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <h4 className="text-sm font-semibold text-emerald-900">C — Connect</h4>
                <p className="mt-2 text-sm text-emerald-900/90">
                  Introduce your prospect kindly and let the tool/upline help from there.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <DoneButton
                checked={!!items["m3:abc"]} onChange={(v) => toggleItem("m3:abc", v)}
                labelTodo="I can do ABC"
                labelDone="ABC ready"
              />
              <button
                type="button"
                onClick={() => markModule("m3", true)}
                className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition
                ${modules["m3"] ? "bg-green-100 text-green-800 ring-1 ring-green-200" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}
              >
                {modules["m3"] ? "Module marked complete" : "Mark module complete"}
              </button>
            </div>
          </section>
        </div>

        {/* Footer link back */}
        <div className="mt-6 flex justify-center">
          <a
            href="/dashboard"
            className="text-sm text-blue-700 hover:text-blue-800 underline underline-offset-4"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

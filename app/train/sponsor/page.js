"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function SponsorTrainingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) router.replace("/login");
      else setReady(true);
    });
    return () => unsub();
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-base text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar (kept simple to match app aesthetic) */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Sponsoring Training</h1>
          <a
            href="/dashboard"
            className="rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25 transition"
          >
            Back
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {/* Hero / Intro */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-6">
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
            Learn how to sponsor — step by step
          </h2>
          <p className="mt-2 text-sm text-gray-700">
            Master three simple modules: <strong>Getting Started</strong>,{" "}
            <strong>Opportunity & Product Presentation</strong>, and{" "}
            <strong>How to do ABC</strong>. Watch the video, follow the steps, and use the quick
            checklists to take action today.
          </p>
        </section>

        {/* Modules */}
        <div className="mt-6 grid gap-4">
          <ModuleCard
            index={1}
            title="Getting Started"
            subtitle="Mindset, building your name list, and inviting people out"
            videoTitle="Getting Started — Full Walkthrough"
            // Replace with your actual video URL when ready
            videoSrc=""
            poster=""
            steps={[
              "Adopt the India Founder mindset — you’re building leaders.",
              "Write a 50–100 person name list (friends, family, colleagues, social).",
              "Segment your list (A: most likely, B: likely, C: longshots).",
              "Use simple invite scripts — book short, clear meetings.",
              "Track outreach daily (5–10 quality invites).",
            ]}
            checklist={[
              "Name list created (≥50)",
              "3 invite scripts prepared (text/voice/WhatsApp)",
              "First 10 invites sent",
            ]}
          />

          <ModuleCard
            index={2}
            title="Opportunity & Product Presentation"
            subtitle="How to present the business and share product stories"
            videoTitle="Opportunity & Product Basics"
            videoSrc=""
            poster=""
            steps={[
              "Open with your story (why India, why now).",
              "Show the simple business model: Build → Duplicate → Multiply.",
              "Highlight 2–3 flagship products with simple benefits.",
              "Handle basics: time, tools, support, and next steps.",
              "Close clearly: invite to register or book ABC with upline.",
            ]}
            checklist={[
              "Personal 60–90s story practiced",
              "2–3 product highlights ready",
              "Closing questions scripted",
            ]}
          />

          <ModuleCard
            index={3}
            title="How to do ABC"
            subtitle="Link people to value: A = Value Add, B = Bridge, C = Customer/Prospect"
            videoTitle="ABC — Value Add, Bridge, Customer"
            videoSrc=""
            poster=""
            steps={[
              "A (Value Add): pick the right asset — live meeting, upline, short recording.",
              "B (Bridge): edify the asset — why it helps your prospect.",
              "C (Customer/Prospect): confirm time, send link, and set expectations.",
              "After: confirm attendance, and schedule the follow-up.",
              "Close with a clear decision or next step.",
            ]}
            checklist={[
              "3 value-add options listed (meeting/upline/tools)",
              "Bridge script written",
              "Follow-up template ready",
            ]}
          />
        </div>
      </main>
    </div>
  );
}

function ModuleCard({ index, title, subtitle, videoTitle, videoSrc, poster, steps, checklist }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1">
            Module {index}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
        </div>
      </div>

      {/* Video */}
      <div className="mt-3 rounded-xl overflow-hidden ring-1 ring-gray-100 bg-black/5">
        <div className="px-3 pt-3 text-xs font-medium text-gray-700">{videoTitle}</div>
        <div className="p-3">
          <div className="aspect-video w-full rounded-lg overflow-hidden bg-black/80">
            {/* Replace src with your hosted MP4 or HLS URL when available */}
            <video controls playsInline poster={poster} className="w-full h-full">
              {videoSrc ? (
                <source src={videoSrc} type="video/mp4" />
              ) : null}
              {!videoSrc && (
                <track kind="captions" srcLang="en" label="English" />
              )}
            </video>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-gray-900">Step-by-step</h4>
        <ol className="mt-2 list-decimal pl-5 space-y-1.5 text-sm text-gray-700">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      {/* Checklist */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold text-gray-900">Quick checklist</h4>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
          {checklist.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA row */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-3 py-2 text-xs font-semibold hover:bg-blue-700 active:scale-[0.99] shadow-sm"
        >
          Back to dashboard
        </a>
      </div>
    </section>
  );
}

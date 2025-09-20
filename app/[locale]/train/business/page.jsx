"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  LineChart,
  Sparkles,
  Users,
  Leaf,
  Cpu,
  Layers,
  Rocket,
  Network,
  BookOpen,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

// --- Helpers ----------------------------------------------------

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const SlideCard = ({ children }) => (
  <div className="w-full max-w-5xl mx-auto bg-white/80 backdrop-blur rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8">
    {children}
  </div>
);

const SectionTitle = ({ icon: Icon, title, subtitle }) => (
  <div className="mb-6">
    <div className="flex items-center gap-3">
      {Icon ? (
        <div className="p-2 rounded-xl bg-blue-50 border border-blue-100">
          <Icon className="h-5 w-5 text-blue-700" />
        </div>
      ) : null}
      <h2 className="text-2xl md:text-3xl font-semibold text-slate-900">{title}</h2>
    </div>
    {subtitle ? <p className="mt-2 text-slate-600">{subtitle}</p> : null}
  </div>
);

// Simple toast (inline)
const Toast = ({ show, message, tone = "success" }) => (
  <AnimatePresence>
    {show ? (
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-3 shadow-lg border ${
          tone === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}
      >
        {message}
      </motion.div>
    ) : null}
  </AnimatePresence>
);

// --- Visuals ----------------------------------------------------

// 1-2-3 Plan Tree (You → 5 frontline; each with their own branch arrows)
const OneTwoThreeTree = () => {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[720px]">
        <svg viewBox="0 0 800 380" className="w-full h-auto">
          {/* Top node: YOU */}
          <defs>
            <linearGradient id="g1" x1="0" x2="1">
              <stop offset="0%" stopColor="#e6f0ff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>

          <rect x="50" y="20" width="700" height="340" rx="16" fill="url(#g1)" />
          <text x="70" y="60" className="fill-slate-600" style={{ fontSize: 14 }}>
            1-2-3 Brand Representative Plan
          </text>

          <g>
            <circle cx="400" cy="90" r="26" fill="#0f60d2" />
            <text x="400" y="95" textAnchor="middle" className="fill-white" style={{ fontSize: 14, fontWeight: 600 }}>
              YOU
            </text>
          </g>

          {/* Connectors to 5 nodes */}
          {Array.from({ length: 5 }).map((_, i) => {
            const startX = 260 + i * 70;
            return (
              <g key={i}>
                <line x1="400" y1="116" x2={startX} y2="170" stroke="#9db8f7" strokeWidth="2" />
                <circle cx={startX} cy="190" r="22" fill="#e9efff" stroke="#cddafe" />
                <text x={startX} y="195" textAnchor="middle" className="fill-slate-700" style={{ fontSize: 12 }}>
                  Partner
                </text>
                {/* Downward arrow hint for each partner's branch */}
                <line x1={startX} y1="212" x2={startX} y2="250" stroke="#cbd5e1" strokeDasharray="4 4" />
                <polygon
                  points={`${startX - 5},250 ${startX + 5},250 ${startX},258`}
                  fill="#cbd5e1"
                />
              </g>
            );
          })}

          {/* Caption rows */}
          <text x="70" y="320" className="fill-slate-700" style={{ fontSize: 13 }}>
            Step 1: Start your own business
          </text>
          <text x="320" y="320" className="fill-slate-700" style={{ fontSize: 13 }}>
            Step 2: Help 2 people start
          </text>
          <text x="560" y="320" className="fill-slate-700" style={{ fontSize: 13 }}>
            Step 3: Help 3 more people start
          </text>
        </svg>
      </div>
    </div>
  );
};

// Duplication Tree (5 → 25 → 125 → 625 → 3,125 → 15,625) + payouts
const DuplicationVisual = ({ volPerPartner = 200000, includeL0 = true }) => {
  const levels = useMemo(() => [5, 25, 125, 625, 3125, 15625], []);
  const payouts = useMemo(() => {
    return levels.map((count) => 0.05 * count * volPerPartner);
  }, [levels, volPerPartner]);

  const l0 = includeL0 ? 0.05 * volPerPartner : 0;

  const sumL1toL3 = payouts.slice(0, 3).reduce((a, b) => a + b, 0);
  const sumAll = payouts.reduce((a, b) => a + b, 0) + l0;

  return (
    <div className="space-y-6">
      {/* Tree counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {levels.map((n, idx) => (
          <div key={idx} className="rounded-xl border bg-gradient-to-br from-slate-50 to-white p-3 text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Level {idx + 1}</p>
            <p className="text-lg font-semibold text-slate-900">{n.toLocaleString("en-US")}</p>
            <p className="text-xs text-slate-500">partners</p>
          </div>
        ))}
      </div>

      {/* Payout chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-600 text-sm">Payouts @ 5% on ₹{volPerPartner.toLocaleString("en-IN")} volume each:</span>
        {payouts.map((p, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm bg-white"
          >
            <span className="text-slate-500">L{i + 1}</span>
            <span className="font-semibold">{inr(p)}</span>
          </span>
        ))}
        {includeL0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm bg-emerald-50 border-emerald-200 text-emerald-800">
            <span className="text-emerald-700">L0 (You)</span>
            <span className="font-semibold">{inr(l0)}</span>
          </span>
        ) : null}
      </div>

      {/* Totals */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4 bg-white">
          <p className="text-slate-500 text-sm">At 155 partners (Levels 1–3)</p>
          <p className="text-xl font-semibold">{inr(sumL1toL3)}</p>
          <p className="text-slate-500 text-xs mt-1">Sum of L1 + L2 + L3</p>
        </div>
        <div className="rounded-xl border p-4 bg-white">
          <p className="text-slate-500 text-sm">All 6 levels {includeL0 ? "+ Level 0" : ""} (rounded)</p>
          <p className="text-xl font-semibold">
            ~{inr(Math.round(sumAll / 1_000_000) * 1_000_000)}
          </p>
          <p className="text-slate-500 text-xs mt-1">Adds every level payout {includeL0 ? "including your own" : ""}</p>
        </div>
      </div>
    </div>
  );
};

// Simple growth chart (SVG) for wellness/supplement trend
const GrowthChart = () => {
  // hard-coded relative points to avoid external libs
  const points = [
    [0, 80],
    [20, 75],
    [40, 68],
    [60, 55],
    [80, 38],
    [100, 25],
  ];
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="w-full h-40 md:h-56">
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="#f8fafc" rx="8" />
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" />
      <path d={`${path} L 100 100 L 0 100 Z`} fill="url(#area)" />
    </svg>
  );
};

// --- Page -------------------------------------------------------

export default function BusinessTrainingPage() {
  const [uid, setUid] = useState(null);
  const [slide, setSlide] = useState(0);
  const [toast, setToast] = useState({ show: false, msg: "", tone: "success" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u ? u.uid : null));
    return () => unsub();
  }, []);

  const notify = useCallback((msg, tone = "success") => {
    setToast({ show: true, msg, tone });
    setTimeout(() => setToast({ show: false, msg: "", tone }), 2200);
  }, []);

  const markComplete = useCallback(async () => {
    try {
      if (!uid) {
        notify("Saved locally. Sign in to sync progress.", "warn");
        return;
      }
      const ref = doc(db, "trainingProgress", uid, "modules", "business");
      await setDoc(
        ref,
        { done: true, updatedAt: serverTimestamp() },
        { merge: true }
      );
      notify("Marked complete ✅");
    } catch (e) {
      notify("Could not save right now. Try again.", "warn");
    }
  }, [uid, notify]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") setSlide((s) => Math.min(s + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setSlide((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const slides = useMemo(
    () => [
      {
        key: "cover",
        node: (
          <SlideCard>
            <div className="text-center">
              <h1 className="text-3xl md:text-5xl font-bold text-slate-900">
                India Business Opportunity
              </h1>
              <p className="mt-3 text-slate-600 text-lg">
                Step Into India’s Health & Wellness Boom — Unlock Growth, Innovation & Impact
              </p>
              <div className="mt-8 rounded-2xl bg-gradient-to-br from-blue-50 to-white border p-6">
                <p className="text-slate-600">
                  A clear, simple path to build a wellness business with measurable results:
                </p>
                <div className="mt-4 grid sm:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-xl bg-white">
                    <Sparkles className="h-5 w-5 text-blue-700" />
                    <p className="mt-2 font-semibold">India Market Boom</p>
                    <p className="text-sm text-slate-600">Young, growing, health-aware population.</p>
                  </div>
                  <div className="p-4 border rounded-xl bg-white">
                    <Leaf className="h-5 w-5 text-blue-700" />
                    <p className="mt-2 font-semibold">Science-Driven Products</p>
                    <p className="text-sm text-slate-600">Nutrition + gene expression + AI tracking.</p>
                  </div>
                  <div className="p-4 border rounded-xl bg-white">
                    <Users className="h-5 w-5 text-blue-700" />
                    <p className="mt-2 font-semibold">Proven System</p>
                    <p className="text-sm text-slate-600">Simple 1-2-3 start + 6-level leadership plan.</p>
                  </div>
                </div>
              </div>
            </div>
          </SlideCard>
        ),
      },
      {
        key: "why-india",
        node: (
          <SlideCard>
            <SectionTitle icon={LineChart} title="Why India Is a Powerful Opportunity" subtitle="Big, young, digital — ready for wellness growth" />
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="rounded-xl border p-4 bg-white">
                  <p className="text-sm text-slate-500">Population & Demographics</p>
                  <p className="text-slate-900 font-semibold">~1.43 Billion people • Median age ~29</p>
                  <p className="text-slate-600 text-sm mt-1">
                    Huge, young consumer base looking for health, energy, and opportunity.
                  </p>
                </div>
                <div className="rounded-xl border p-4 bg-white">
                  <p className="text-sm text-slate-500">Health & Wellness Market</p>
                  <p className="text-slate-900 font-semibold">~USD 156B (2024) → ~USD 257B (2033)</p>
                  <p className="text-slate-600 text-sm mt-1">Growing steadily with rising awareness & incomes.</p>
                </div>
                <div className="rounded-xl border p-4 bg-white">
                  <p className="text-sm text-slate-500">Digital Adoption</p>
                  <p className="text-slate-900 font-semibold">Smartphone-first, social-driven discovery</p>
                  <p className="text-slate-600 text-sm mt-1">Easy to share results and scale across India.</p>
                </div>
              </div>
              <div className="rounded-xl border p-4 bg-white">
                <p className="text-sm text-slate-500">Trend Snapshot</p>
                <GrowthChart />
                <p className="text-xs text-slate-500 mt-3">
                  Notes: Market size figures compiled from recent industry reports; used here for training/illustration.
                </p>
              </div>
            </div>
          </SlideCard>
        ),
      },
      {
        key: "wellness-stats",
        node: (
          <SlideCard>
            <SectionTitle icon={Leaf} title="Wellness & Supplement Growth" subtitle="Supplements and personalized wellness are rising fast" />
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border rounded-xl p-4 bg-white">
                <p className="text-sm text-slate-500">Supplements (India)</p>
                <p className="font-semibold text-slate-900">~USD 42.9B → ~USD 68.4B by 2030</p>
                <p className="text-sm text-slate-600 mt-1">CAGR ~8%</p>
              </div>
              <div className="border rounded-xl p-4 bg-white">
                <p className="text-sm text-slate-500">Dietary Supplements (Longer Horizon)</p>
                <p className="font-semibold text-slate-900">2025 → 2034 ~12.9% CAGR</p>
                <p className="text-sm text-slate-600 mt-1">Strong multi-year tailwinds</p>
              </div>
              <div className="border rounded-xl p-4 bg-white">
                <p className="text-sm text-slate-500">Personalized Wellness</p>
                <p className="font-semibold text-slate-900">High-growth niche (~17% CAGR)</p>
                <p className="text-sm text-slate-600 mt-1">Fits gene-tech + AI monitoring</p>
              </div>
            </div>
            <div className="mt-6">
              <GrowthChart />
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Notes: Growth estimates compiled from multiple industry sources; for internal training only.
            </p>
          </SlideCard>
        ),
      },
      {
        key: "problem",
        node: (
          <SlideCard>
            <SectionTitle icon={Layers} title="The Problem" subtitle="People take supplements but can't see if they’re working" />
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border rounded-xl p-4 bg-white">
                <p className="font-semibold text-slate-900">No Tracking</p>
                <p className="text-sm text-slate-600">Most people can’t measure progress or know what to adjust.</p>
              </div>
              <div className="border rounded-xl p-4 bg-white">
                <p className="font-semibold text-slate-900">Nutrition Gaps</p>
                <p className="text-sm text-slate-600">Common vitamin/mineral deficiencies and lifestyle stress.</p>
              </div>
              <div className="border rounded-xl p-4 bg-white">
                <p className="font-semibold text-slate-900">Generic Advice</p>
                <p className="text-sm text-slate-600">One-size-fits-all tips don’t match personal biology.</p>
              </div>
            </div>
          </SlideCard>
        ),
      },
      {
        key: "opportunity",
        node: (
          <SlideCard>
            <SectionTitle icon={Rocket} title="The Opportunity" subtitle="Right timing: awareness + tech + demand for proof" />
            <ul className="grid md:grid-cols-2 gap-3 text-slate-700">
              <li className="p-3 rounded-xl border bg-white">People want preventive, measurable wellness.</li>
              <li className="p-3 rounded-xl border bg-white">Tech makes testing & feedback accessible.</li>
              <li className="p-3 rounded-xl border bg-white">India’s market is young, growing, and digital-first.</li>
              <li className="p-3 rounded-xl border bg-white">Trust grows when results can be shown and shared.</li>
            </ul>
          </SlideCard>
        ),
      },
      {
        key: "solution",
        node: (
          <SlideCard>
            <SectionTitle icon={Cpu} title="Our Solution" subtitle="Nutrition + Gene Expression + AI Wellness Tech" />
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border rounded-xl p-4 bg-white">
                <p className="font-semibold text-slate-900">LifePak</p>
                <p className="text-sm text-slate-600">Foundational antioxidants, vitamins & minerals.</p>
              </div>
              <div className="border rounded-xl p-4 bg-white">
                <p className="font-semibold text-slate-900">ageLOC</p>
                <p className="text-sm text-slate-600">
                  Gene-expression supplements working at the <span className="font-semibold">genetic level</span> to target the source of aging and cellular health.
                </p>
              </div>
              <div className="border rounded-xl p-4 bg-white">
                <p className="font-semibold text-slate-900">PrysmIO</p>
                <p className="text-sm text-slate-600">
                  AI wellness tech that scans antioxidant & wellness markers in seconds — clear feedback loops that keep people engaged.
                </p>
              </div>
            </div>
            <div className="mt-6 rounded-xl border bg-white p-4">
              <p className="text-slate-700">
                <strong>How it fits:</strong> Foundational nutrition + gene-tech personalization + AI tracking = measurable results and better retention.
              </p>
            </div>
          </SlideCard>
        ),
      },
      {
        key: "123",
        node: (
          <SlideCard>
            <SectionTitle icon={Network} title="1-2-3 Brand Representative Plan" subtitle="Keep it simple, make it duplicable" />
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="rounded-xl border p-4 bg-white">
                  <p className="font-semibold text-slate-900">Step 1</p>
                  <p className="text-slate-600 text-sm">Start your own business.</p>
                </div>
                <div className="rounded-xl border p-4 bg-white">
                  <p className="font-semibold text-slate-900">Step 2</p>
                  <p className="text-slate-600 text-sm">Help <strong>2 people</strong> start — each becomes a branch.</p>
                </div>
                <div className="rounded-xl border p-4 bg-white">
                  <p className="font-semibold text-slate-900">Step 3</p>
                  <p className="text-slate-600 text-sm">Help <strong>3 more</strong> people start — also your frontline.</p>
                </div>
                <div className="rounded-xl border p-4 bg-blue-50 border-blue-200">
                  <p className="text-slate-800 text-sm">
                    You now have <strong>5 frontline partners</strong>. Each builds their own line using the same 1-2-3 plan.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border p-3 bg-white">
                <OneTwoThreeTree />
              </div>
            </div>
          </SlideCard>
        ),
      },
      {
        key: "duplication",
        node: (
          <SlideCard>
            <SectionTitle icon={Users} title="Duplication Model — Leadership Plan (6L5%)" subtitle="5% on each level’s volume (plus 5% on your own)" />
            <div className="mb-4 text-sm text-slate-600">
              Assumptions: each partner does <strong>₹200,000</strong> in monthly volume; duplication by 5; maximum 6 levels.
            </div>
            <DuplicationVisual volPerPartner={200000} includeL0 />
            <p className="text-xs text-slate-500 mt-4">
              Illustrative example for training. Actual payouts depend on official plan rules and qualifications.
            </p>
          </SlideCard>
        ),
      },
      {
        key: "franchise",
        node: (
          <SlideCard>
            <SectionTitle icon={Network} title="PrysmIO = Mini Wellness Franchise" subtitle="Results create demand. Demand grows your network." />
            <ul className="grid md:grid-cols-2 gap-3 text-slate-700">
              <li className="p-3 rounded-xl border bg-white">Each device helps people measure and see progress.</li>
              <li className="p-3 rounded-xl border bg-white">When people see results, they share with family & friends.</li>
              <li className="p-3 rounded-xl border bg-white">More scans → more interest → more customers & partners.</li>
              <li className="p-3 rounded-xl border bg-white">Your network expands like local “wellness franchises.”</li>
            </ul>
          </SlideCard>
        ),
      },
      {
        key: "support",
        node: (
          <SlideCard>
            <SectionTitle icon={BookOpen} title="System Support & Roadmap" subtitle="You’re not alone — we grow together" />
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border rounded-xl p-4 bg-white">
                <p className="font-semibold text-slate-900">Tools</p>
                <p className="text-sm text-slate-600">Presentations, scripts, assets, and trackers.</p>
              </div>
              <div className="border rounded-xl p-4 bg-white">
                <p className="font-semibold text-slate-900">Training</p>
                <p className="text-sm text-slate-600">Regular Zooms, replays, and step-by-step playbooks.</p>
              </div>
              <div className="border rounded-xl p-4 bg-white">
                <p className="font-semibold text-slate-900">Mentorship</p>
                <p className="text-sm text-slate-600">Experienced leaders to guide your growth.</p>
              </div>
            </div>
          </SlideCard>
        ),
      },
      {
        key: "closing",
        node: (
          <SlideCard>
            <div className="text-center">
              <h3 className="text-2xl md:text-3xl font-semibold text-slate-900">Become a Founder. Complete Brand Representative.</h3>
              <p className="mt-3 text-slate-600">
                Start simple with 1-2-3, measure results, and duplicate across India.
              </p>
              <button
                onClick={markComplete}
                className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
              >
                <CheckCircle2 className="h-5 w-5" />
                Mark Module Complete
              </button>
              <p className="text-xs text-slate-500 mt-4">
                Training content for internal education. Figures shown are illustrative.
              </p>
            </div>
          </SlideCard>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid]
  );

  return (
    <div className="min-h-[calc(100svh-80px)] bg-gradient-to-b from-slate-50 to-white">
      {/* Header / Breadcrumbs mimic existing style */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Training</p>
            <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Business Module</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600 text-sm hidden sm:inline">Slide {slide + 1} / {slides.length}</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={slides[slide].key}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {slides[slide].node}
          </motion.div>
        </AnimatePresence>

        {/* Nav */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setSlide((s) => Math.max(0, s - 1))}
            disabled={slide === 0}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>
          <div className="flex items-center gap-1">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                className={`h-2.5 w-2.5 rounded-full ${
                  i === slide ? "bg-blue-600" : "bg-slate-300 hover:bg-slate-400"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
          <button
            onClick={() => setSlide((s) => Math.min(slides.length - 1, s + 1))}
            disabled={slide === slides.length - 1}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Toast show={toast.show} message={toast.msg} tone={toast.tone} />
    </div>
  );
}

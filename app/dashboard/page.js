"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import { useVirtualizer } from "@tanstack/react-virtual";
import QRCode from "qrcode";
import dynamic from "next/dynamic";

const Confetti = dynamic(() => import("react-confetti"), { ssr: false });

/** ===== Constants ===== */
const MAX_DEPTH = 6;
const PAGE_SIZE = 50;
const STORAGE_KEYS = {
  ONBOARD_V: "india_dash_seenOnboardingV1",
  COACH_V: "india_dash_seenCoachV1",
};
const L1_GOAL = 10;
const HELP_TARGET = 3;

export default function DashboardPage() {
  const router = useRouter();

  /** ===== Identity ===== */
  const [currentUid, setCurrentUid] = useState(null);
  const [userData, setUserData] = useState(null);
  const [upline, setUpline] = useState(null);

  /** ===== Loading & errors ===== */
  const [loading, setLoading] = useState(true);
  const [dashError, setDashError] = useState("");
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState("");

  /** ===== Counts ===== */
  const [counts, setCounts] = useState({
    levels: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
    sixPlus: 0,
    total: 0,
  });

  /** ===== Tree data ===== */
  const [childrenCache, setChildrenCache] = useState({});
  const [parentOf, setParentOf] = useState({});
  const [expanded, setExpanded] = useState(new Set());
  const [expandLevel, setExpandLevel] = useState(1);
  const [nodePages, setNodePages] = useState({});

  /** ===== L1 progress ===== */
  const [l1Progress, setL1Progress] = useState({});
  const [focusHelp3, setFocusHelp3] = useState(false);

  /** ===== Search ===== */
  const [search, setSearch] = useState("");
  const searchDebounce = useRef(null);
  const hasActiveSearch = useMemo(() => search.trim().length >= 2, [search]);

  /** ===== Clipboard ===== */
  const [copySuccess, setCopySuccess] = useState("");

  /** ===== Header menu ===== */
  const [menuOpen, setMenuOpen] = useState(false);

  /** ===== QR ===== */
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrSize, setQrSize] = useState(120);
  const qrBoxRef = useRef(null);
  const iconPx = Math.min(28, Math.max(18, Math.floor(qrSize * 0.18)));

  /** ===== Onboarding & Coach ===== */
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onStep, setOnStep] = useState(0);
  const [showCoach, setShowCoach] = useState(false);
  const [coachStep, setCoachStep] = useState(0);
  const [coachPos, setCoachPos] = useState({ top: 0, left: 0, w: 0, h: 0 });
  const coachTargets = ["qrShareBlock", "searchInput", "expandRootBtn"];

  /** ===== Confetti celebration ===== */
  const [showConfetti, setShowConfetti] = useState(false);

  /** ===== Helpers ===== */
  function referralLink() {
    if (!userData?.referralId && typeof window === "undefined") return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/register?ref=${userData?.referralId || ""}`;
  }
  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 18) return "Good Afternoon";
    return "Good Evening";
  }
  function handleCopy() {
    if (userData?.referralId) {
      const link = referralLink();
      navigator.clipboard.writeText(link).then(() => {
        setCopySuccess("Referral link copied!");
        setTimeout(() => setCopySuccess(""), 2000);
      });
    }
  }

  /** ===== Confetti trigger when 10 complete ===== */
  const goalDone = (counts.levels?.["1"] || 0) >= L1_GOAL;
  const goalPct = Math.min(100, Math.round(((counts.levels?.["1"] || 0) / L1_GOAL) * 100));
  useEffect(() => {
    if (goalDone) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [goalDone]);

  /** ===== Init auth ===== */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setCurrentUid(currentUser.uid);
        await loadUser(currentUser.uid);
        await refreshCounts();
        await expandToLevel(1);
      }
    });
    return () => unsub();
  }, [router]);

  async function loadUser(uid) {
    try {
      const meSnap = await getDoc(doc(db, "users", uid));
      if (meSnap.exists()) setUserData(meSnap.data());
      const me = meSnap.data();
      if (me?.upline) {
        const upSnap = await getDoc(doc(db, "users", me.upline));
        if (upSnap.exists()) setUpline(upSnap.data());
      }
    } catch (e) {
      setDashError("Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshCounts() {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/level-counts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Counts error");
      setCounts(data);
    } catch {
      setDashError("Unable to refresh counts.");
    }
  }

  /** ===== L1 progress helpers ===== */
  async function fetchL1Progress(uid) {
    if (l1Progress[uid] !== undefined) return l1Progress[uid];
    const qy = query(collection(db, "users"), where("upline", "==", uid), limit(11));
    const snap = await getDocs(qy);
    const count = Math.min(10, snap.size >= 10 ? 10 : snap.size);
    setL1Progress((prev) => ({ ...prev, [uid]: count }));
    return count;
  }
  const l1Children = childrenCache[currentUid] || [];
  const completedL1 = useMemo(() => {
    let c = 0;
    for (const kid of l1Children) {
      const n = l1Progress[kid.id];
      if (n !== undefined && n >= 10) c++;
    }
    return c;
  }, [l1Children, l1Progress]);

  /** ===== Loading ===== */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-base text-gray-500">Loading…</p>
      </div>
    );
  }

  /** ===== Render ===== */
  return (
    <div className="min-h-screen bg-white">
      {showConfetti && <Confetti recycle={false} numberOfPieces={300} />}
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Team Dashboard</h1>
          <button
            onClick={async () => {
              await signOut(auth);
              router.push("/login");
            }}
            className="rounded-md bg-blue-500/70 px-3 py-1.5 text-sm hover:bg-blue-500"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {/* Identity */}
        <section className="rounded-2xl border bg-white/80 shadow-sm p-4 sm:p-6">
          <div className="text-base sm:text-lg font-medium">
            {greeting()}, <span className="font-bold">{userData?.name}</span>
          </div>
          <div className="text-sm text-gray-600">
            Referral ID: <span className="font-mono text-blue-700">{userData?.referralId}</span>
          </div>
          {upline && (
            <div className="text-xs text-gray-500">
              Upline: {upline.name} ({upline.referralId})
            </div>
          )}
        </section>

        {/* Stats */}
        <section className="mt-6 text-center">
          <StatCard label="Total Downlines" value={counts.total} tone="green" />
        </section>

        {/* === MISSIONS === */}
        <section className="mt-8">
          <MissionCards
            counts={counts}
            referralLink={referralLink}
            handleCopy={handleCopy}
            goalDone={goalDone}
            goalPct={goalPct}
            completedL1={completedL1}
          />
        </section>
      </div>
    </div>
  );
}

/** ===== Mission Cards Component ===== */
function MissionCards({ counts, referralLink, handleCopy, goalDone, goalPct, completedL1 }) {
  const L1count = counts.levels?.["1"] || 0;
  const helpDone = completedL1 >= HELP_TARGET;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Mission 1 */}
      <MissionCard
        title="Register 10 India Founders"
        progress={`${L1count}/10`}
        pct={goalPct}
        done={goalDone}
        ctaLabel="Copy Link"
        onCta={handleCopy}
      />

      {/* Mission 2 */}
      <MissionCard
        title="Help 3 Level 1 reach 10"
        progress={`${completedL1}/3`}
        pct={Math.min(100, Math.round((completedL1 / 3) * 100))}
        done={helpDone}
        locked={!goalDone}
        ctaLabel="View Level 1"
        onCta={() => {
          document.getElementById("teamSection")?.scrollIntoView({ behavior: "smooth" });
        }}
      />
    </div>
  );
}

function MissionCard({ title, progress, pct, done, locked, ctaLabel, onCta }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${locked ? "opacity-50" : ""}`}>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16">
            <circle
              className="text-gray-200"
              strokeWidth="6"
              stroke="currentColor"
              fill="transparent"
              r="26"
              cx="32"
              cy="32"
            />
            <circle
              className={done ? "text-green-500" : "text-blue-500"}
              strokeWidth="6"
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r="26"
              cx="32"
              cy="32"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={2 * Math.PI * 26 * (1 - pct / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
            {progress}
          </div>
        </div>
        <div className="flex-1">
          <button
            onClick={onCta}
            disabled={locked}
            className="mt-2 w-full rounded-xl bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700 disabled:bg-gray-300"
          >
            {locked ? "Locked" : ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const tones = {
    green: "bg-green-50 text-green-700 border-green-100",
  };
  return (
    <div className={`mx-auto max-w-xs rounded-2xl border ${tones[tone]} p-4 text-center shadow-sm`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

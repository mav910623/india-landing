"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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

/** ===== Constants ===== */
const MAX_DEPTH = 6;
const PAGE_SIZE = 50;
const L1_GOAL = 10;  // Mission 1 target
const M2_TARGET = 3; // Mission 2 target (L1 leaders with 10)
const M3_TARGET = 3; // Mission 3 target (L2 leaders with 10)
const VIRTUALIZE_THRESHOLD = 150;

export default function DashboardPage() {
  const router = useRouter();

  /** ===== Identity ===== */
  const [currentUid, setCurrentUid] = useState(null);
  const [userData, setUserData] = useState(null);

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

  /** ===== Tree data & expansion ===== */
  const [childrenCache, setChildrenCache] = useState({}); // parentUid -> children[]
  const [parentOf, setParentOf] = useState({});
  const [expanded, setExpanded] = useState(new Set());
  const [nodePages, setNodePages] = useState({}); // parentUid -> { items, cursor, hasMore }

  /** ===== Progress caches ===== */
  const [l1Progress, setL1Progress] = useState({});   // uid -> [0..10] (# of direct L1 downlines)
  const [l2Leaders10, setL2Leaders10] = useState(0);  // count of L2 members with ≥10 (for Mission 3)

  /** ===== UI toggles ===== */
  const [showHelp, setShowHelp] = useState(false);
  const [showAllMissions, setShowAllMissions] = useState(false);
  const [showLevelBreakdown, setShowLevelBreakdown] = useState(false);

  /** ===== Clipboard / QR ===== */
  const [copySuccess, setCopySuccess] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrSize, setQrSize] = useState(120);
  const qrBoxRef = useRef(null);
  const iconPx = Math.min(28, Math.max(18, Math.floor(qrSize * 0.18)));

  /** ===== Helpers ===== */
  const normalize = (s) => String(s || "").toLowerCase();

  // Safer referral link (SSR-safe + env fallback).
  const referralLink = () => {
    const site =
      (typeof window !== "undefined" && window.location?.origin) ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "";
    if (!site) return "";
    const ref = userData?.referralId || "";
    return `${site}/register?ref=${ref}`;
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const handleCopy = () => {
    const link = referralLink();
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopySuccess("Referral link copied!");
      setTimeout(() => setCopySuccess(""), 1600);
    });
  };

  /** ===== Auth boot ===== */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      if (!cu) {
        router.push("/login");
      } else {
        setCurrentUid(cu.uid);
        await loadUser(cu.uid);
        await refreshCounts();
        await expandToLevel(1); // open L1 on load
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  /** ===== User & counts ===== */
  async function loadUser(uid) {
    try {
      const meSnap = await getDoc(doc(db, "users", uid));
      if (!meSnap.exists()) {
        setDashError("User not found.");
        setLoading(false);
        return;
      }
      setUserData(meSnap.data());
    } catch (e) {
      console.error(e);
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
    } catch (e) {
      console.error(e);
      setDashError("Unable to refresh counts.");
    }
  }

  /** ===== QR: responsive size & image ===== */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = qrBoxRef.current;
    if (!el || !("ResizeObserver" in window)) {
      const w = window.innerWidth || 1024;
      setQrSize(w < 380 ? 96 : w < 640 ? 120 : 160);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = entry.contentRect.width || 140;
        setQrSize(Math.max(96, Math.min(200, Math.floor(cw - 12))));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Slightly debounce QR regeneration to avoid thrashing on small resizes
  const qrTimer = useRef(null);
  useEffect(() => {
    const link = referralLink();
    if (!link) return;
    if (qrTimer.current) clearTimeout(qrTimer.current);
    qrTimer.current = setTimeout(() => {
      QRCode.toDataURL(link, { width: qrSize, margin: 0, errorCorrectionLevel: "M" })
        .then((url) => setQrDataUrl(url))
        .catch((e) => {
          console.error("QR generate failed", e);
          setQrDataUrl("");
        });
    }, 80);
    return () => {
      if (qrTimer.current) clearTimeout(qrTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrSize, userData?.referralId]);

  /** ===== Tree: fetch children (paged) ===== */
  async function fetchChildren(parentUid, { append = false } = {}) {
    if (!parentUid) return [];
    const page = nodePages[parentUid];
    if (!append && page?.items) return page.items;

    let qy = query(
      collection(db, "users"),
      where("upline", "==", parentUid),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE)
    );
    if (append && page?.cursor) {
      qy = query(
        collection(db, "users"),
        where("upline", "==", parentUid),
        orderBy("createdAt", "desc"),
        startAfter(page.cursor),
        limit(PAGE_SIZE)
      );
    }

    const snap = await getDocs(qy);
    const rows = snap.docs.map((d) => {
      const x = d.data() || {};
      return {
        id: d.id,
        uid: x.uid || d.id,
        name: x.name || "",
        email: x.email || "",
        phone: x.phone || "",
        referralId: x.referralId || "",
      };
    });

    const newItems = append && page?.items ? [...page.items, ...rows] : rows;
    const cursor = snap.docs[snap.docs.length - 1] || null;
    const hasMore = snap.size === PAGE_SIZE;

    setNodePages((prev) => ({ ...prev, [parentUid]: { items: newItems, cursor, hasMore } }));
    setChildrenCache((prev) => ({ ...prev, [parentUid]: newItems }));
    setParentOf((prev) => {
      const next = { ...prev };
      for (const k of newItems) next[k.id] = parentUid;
      return next;
    });

    return newItems;
  }

  async function toggleNode(parentUid, level) {
    if (!currentUid || !parentUid || level > MAX_DEPTH) return;
    setTreeError("");
    setTreeLoading(true);
    try {
      const willOpen = !expanded.has(parentUid);
      if (willOpen) await fetchChildren(parentUid);
      const next = new Set(expanded);
      if (willOpen) next.add(parentUid);
      else next.delete(parentUid);
      setExpanded(next);
    } catch (e) {
      console.error(e);
      setTreeError("Expand/collapse failed.");
    } finally {
      setTreeLoading(false);
    }
  }

  async function expandToLevel(targetLevel) {
    if (!currentUid) return;
    setTreeError("");
    setTreeLoading(true);
    try {
      let newExpanded = new Set();
      let frontier = [currentUid];
      for (let lvl = 1; lvl <= targetLevel; lvl++) {
        const next = [];
        for (const pid of frontier) {
          const kids = await fetchChildren(pid);
          if (kids.length) {
            newExpanded.add(pid);
            next.push(...kids.map((k) => k.id));
          }
        }
        frontier = next;
      }
      setExpanded(newExpanded);
    } catch (e) {
      console.error(e);
      setTreeError("Expand failed.");
    } finally {
      setTreeLoading(false);
    }
  }

  /** ===== Progress helpers ===== */
  async function fetchL1Progress(uid) {
    if (l1Progress[uid] !== undefined) return l1Progress[uid];
    const qy = query(collection(db, "users"), where("upline", "==", uid), limit(11));
    const snap = await getDocs(qy);
    const count = Math.min(10, snap.size >= 10 ? 10 : snap.size);
    setL1Progress((prev) => ({ ...prev, [uid]: count }));
    return count;
  }

  /** Mission 2: number of L1 with ≥10 */
  const l1Children = childrenCache[currentUid] || [];
  const completedL1 = useMemo(() => {
    let c = 0;
    for (const kid of l1Children) {
      const n = l1Progress[kid.id];
      if (n !== undefined && n >= 10) c++;
    }
    return c;
  }, [l1Children, l1Progress]);

  /** Mission 3: number of L2 with ≥10 (prefetch after M2 done) */
  const mission1Done = (counts.levels?.["1"] || 0) >= L1_GOAL;
  const mission2Done = mission1Done && completedL1 >= M2_TARGET;

  useEffect(() => {
    if (!mission2Done || !currentUid) return;

    (async () => {
      try {
        const L1 = childrenCache[currentUid] || (await fetchChildren(currentUid));
        let tally = 0;

        for (const l1 of L1.slice(0, 50)) {
          const l2 = childrenCache[l1.id] || (await fetchChildren(l1.id));
          for (const g of (l2 || []).slice(0, 200)) {
            const cnt = await fetchL1Progress(g.id);
            if (cnt >= 10) {
              tally++;
              if (tally >= M3_TARGET) break;
            }
          }
          if (tally >= M3_TARGET) break;
        }
        setL2Leaders10(tally);
      } catch (e) {
        console.warn("Mission 3 tally failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission2Done, currentUid]);

  /** Hero guidance (dynamic) */
  function heroLine() {
    if (!mission1Done) {
      const need = Math.max(0, L1_GOAL - (counts.levels?.["1"] || 0));
      return (
        <>
          Start now: complete <strong>Mission 1</strong> by sponsoring your first{" "}
          <strong>10 India Founders</strong>. <span className="text-blue-700 font-semibold">{need} to go.</span>
        </>
      );
    }
    if (!mission2Done) {
      const need = Math.max(0, M2_TARGET - completedL1);
      return (
        <>
          Great work! Next is <strong>Mission 2</strong> — grow{" "}
          <strong>3 leaders</strong> in Level 1 to reach <strong>10</strong>.{" "}
          <span className="text-blue-700 font-semibold">{need} more leader{need === 1 ? "" : "s"}.</span>
        </>
      );
    }
    if (l2Leaders10 < M3_TARGET) {
      const need = Math.max(0, M3_TARGET - l2Leaders10);
      return (
        <>
          Momentum! <strong>Mission 3</strong> — multiply into Level 2: help{" "}
          <strong>3 leaders</strong> reach <strong>10</strong>.{" "}
          <span className="text-blue-700 font-semibold">{need} to go.</span>
        </>
      );
    }
    return <>You’re building a powerful network. Keep multiplying your leaders.</>;
  }

  const m1Pct = Math.min(100, Math.round(((counts.levels?.["1"] || 0) / L1_GOAL) * 100));
  const m2Pct = mission1Done ? Math.min(100, Math.round((completedL1 / M2_TARGET) * 100)) : 0;
  const m3Pct = mission2Done ? Math.min(100, Math.round((l2Leaders10 / M3_TARGET) * 100)) : 0;

  /** ===== Loading screen ===== */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-base text-gray-500">Loading…</p>
      </div>
    );
  }

  /** ===== UI ===== */
  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Team Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25 transition"
              title="How it works"
            >
              Help
            </button>
            <button
              onClick={async () => {
                await signOut(auth);
                router.push("/login");
              }}
              className="rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25 transition"
              title="Log out"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {/* ===== Hero ===== */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-600">{greeting()},</p>
              <h2 className="mt-0.5 text-xl font-extrabold text-gray-900 tracking-tight truncate">
                {userData?.name || "India Founder"}
              </h2>
              <p className="mt-2 text-sm text-gray-700">{heroLine()}</p>

              {/* NEW: Learn how to sponsor button */}
              <div className="mt-3">
                <a
                  href="/train/sponsor"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-3 py-2 text-sm font-semibold hover:bg-indigo-700 active:scale-[0.99] shadow-sm"
                  title="Step-by-step training"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                       viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                       className="opacity-90">
                    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22h11A2.5 2.5 0 0 0 20 19.5V6l-5-4H6.5A2.5 2.5 0 0 0 4 4.5z"/>
                    <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                    <path d="m12 12 4 2-4 2-4-2 4-2z"/>
                  </svg>
                  Learn how to sponsor
                </a>
              </div>

              {dashError && (
                <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 border border-amber-200">
                  {dashError}
                </div>
              )}
            </div>

            {/* QR with actions */}
            <div className="shrink-0" id="qrShareBlock">
              <div
                ref={qrBoxRef}
                className="rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 shadow-sm p-3 flex flex-col items-center w-[140px] sm:w-[160px]"
                title="Share this to invite"
              >
                <div className="text-[11px] font-medium text-gray-600 mb-2">Invite with QR</div>
                <div className="rounded-2xl overflow-hidden shadow ring-1 ring-gray-100">
                  <Image
                    src={qrDataUrl || "data:image/gif;base64,R0lGODlhAQABAAAAACw="}
                    alt="Referral QR"
                    width={qrSize}
                    height={qrSize}
                    priority
                    unoptimized
                    className="block"
                    style={{ width: qrSize, height: qrSize }}
                  />
                </div>

                {/* Buttons under QR */}
                <div className="mt-2 grid grid-cols-2 gap-2 w-full">
                  <button
                    onClick={handleCopy}
                    aria-label="Copy referral link"
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 transition flex items-center justify-center shadow-sm"
                    title="Copy referral link"
                    style={{ height: Math.max(36, Math.floor(qrSize * 0.28)) }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      "Ready to be an India Founder? Register using this link and start building team India\n\n" +
                        referralLink()
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Share on WhatsApp"
                    className="rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition flex items-center justify-center shadow-sm"
                    title="Share on WhatsApp"
                    style={{ height: Math.max(36, Math.floor(qrSize * 0.28)) }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="currentColor" className="text-emerald-700">
                      <path d="M20.52 3.48A11.94 11.94 0 0 0 12.01 0C5.39 0 .04 5.35.04 11.96c0 2.11.55 4.16 1.6 5.99L0 24l6.2-1.62a11.95 11.95 0 0 0 5.81 1.49h.01c6.61 0 11.96-5.35 11.96-11.96 0-3.2-1.25-6.21-3.46-8.42ZM12.02 21.3h-.01a9.29 9.29 0 0 1-4.74-1.3l-.34-.2-3.68.96.98-3.58-.22-.37a9.27 9.27 0 0 1-1.42-4.9c0-5.12 4.17-9.29 9.3-9.29 2.48 0 4.81.96 6.57 2.72a9.25 9.25 0 0 1 2.72 6.57c0 5.13-4.17 9.29-9.3 9.29Zm5.35-6.94c-.29-.15-1.7-.84-1.96-.94-.26-.1-.45-.15-.64.15-.19.29-.74.94-.91 1.13-.17.19-.34.21-.63.07-.29-.15-1.22-.45-2.32-1.43-.86-.77-1.44-1.73-1.61-2.02-.17-.29-.02-.45.13-.6.14-.14.29-.37.43-.56.14-.19.19-.32.29-.53.1-.21.05-.39-.02-.54-.07-.15-.64-1.55-.88-2.12-.23-.56-.47-.49-.64-.5h-.55c-.19 0-.5.07-.76.37-.26.29-1 1-1 2.42s1.03 2.81 1.18 3.01c.15.19 2.03 3.09 4.91 4.34.69.3 1.23.48 1.65.61.69.22 1.31.19 1.8.12.55-.08 1.7-.7 1.94-1.37.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.34Z" />
                    </svg>
                  </a>
                </div>

                {copySuccess && (
                  <span className="mt-1 text-[11px] text-green-600">{copySuccess}</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ===== Missions ===== */}
        <section className="mt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <MissionWide
              title="Mission 1: Build"
              subtitle="Sponsor your first 10 India Founders. This unlocks your team’s momentum."
              progress={`${counts.levels?.["1"] || 0}/10`}
              pct={Math.min(100, Math.round(((counts.levels?.["1"] || 0) / L1_GOAL) * 100))}
            />

            {(showAllMissions || ((counts.levels?.["1"] || 0) >= L1_GOAL)) && (
              <MissionWide
                title="Mission 2: Duplicate"
                subtitle="Grow 3 leaders in Level 1 — help each reach their own 10."
                progress={`${Math.min(M2_TARGET, completedL1)}/3`}
                pct={(counts.levels?.["1"] || 0) >= L1_GOAL ? Math.min(100, Math.round((completedL1 / M2_TARGET) * 100)) : 0}
                locked={!((counts.levels?.["1"] || 0) >= L1_GOAL)}
              />
            )}

            {(showAllMissions || ( (counts.levels?.["1"] || 0) >= L1_GOAL && completedL1 >= M2_TARGET)) && (
              <MissionWide
                title="Mission 3: Multiply"
                subtitle="Repeat in Level 2 — support 3 leaders to reach 10."
                progress={`${Math.min(M3_TARGET, l2Leaders10)}/3`}
                pct={( (counts.levels?.["1"] || 0) >= L1_GOAL && completedL1 >= M2_TARGET )
                  ? Math.min(100, Math.round((l2Leaders10 / M3_TARGET) * 100))
                  : 0}
                locked={!((counts.levels?.["1"] || 0) >= L1_GOAL && completedL1 >= M2_TARGET)}
              />
            )}
          </div>

          {/* Chevron to view all missions / collapse */}
          <div className="mt-3 flex items-center justify-center">
            <button
              onClick={() => setShowAllMissions((v) => !v)}
              className="inline-flex items-center gap-2 text-xs font-medium text-blue-700 hover:text-blue-800 rounded-full px-3 py-1.5 bg-blue-50 hover:bg-blue-100 transition"
              title={showAllMissions ? "Hide all missions" : "View all missions"}
            >
              {showAllMissions ? "Hide missions" : "View all missions"}
              <span className={`transition-transform ${showAllMissions ? "rotate-180" : ""}`}>
                ▼
              </span>
            </button>
          </div>
        </section>

        {/* ===== Team ===== */}
        <section
          id="teamSection"
          className="mt-8 rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Your Team</h3>
              <button
                onClick={() => setShowLevelBreakdown((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-800 hover:bg-gray-100 transition"
                title={showLevelBreakdown ? "Hide level breakdown" : "Show level breakdown"}
              >
                <span className="font-semibold">Total: {counts.total}</span>
                <span className={`transition-transform ${showLevelBreakdown ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>
            </div>
            {treeLoading && <span className="text-xs text-gray-500">Loading…</span>}
          </div>

          {showLevelBreakdown && (
            <div className="mt-3 -mx-1 overflow-x-auto">
              <div className="flex gap-2 px-1 pb-1">
                {[1, 2, 3, 4, 5].map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-800 shadow-sm"
                  >
                    L{l}
                    <span className="ml-1.5 font-semibold">
                      {counts.levels[String(l)] || 0}
                    </span>
                  </span>
                ))}
                <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs text-purple-700 shadow-sm">
                  6+
                  <span className="ml-1.5 font-semibold">{counts.sixPlus || 0}</span>
                </span>
              </div>
            </div>
          )}

          {/* Root (L0) */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                id="expandRootBtn"
                onClick={() => toggleNode(currentUid, 1)}
                disabled={treeLoading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-[0.98] transition"
                title={expanded.has(currentUid) ? "Collapse" : "Expand"}
              >
                {expanded.has(currentUid) ? "−" : "+"}
              </button>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  <span className="mr-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">
                    L0
                  </span>
                  {userData?.name || "You"}
                </div>
                <div className="text-xs text-gray-500 truncate font-mono text-blue-700">
                  {userData?.referralId}
                </div>
              </div>
            </div>

            {expanded.has(currentUid) && (
              <div className="ml-3 sm:ml-4 border-l border-gray-100 pl-2 sm:pl-3">
                <TreeChildren
                  parentId={currentUid}
                  level={1}
                  childrenCache={childrenCache}
                  nodePages={nodePages}
                  expanded={expanded}
                  toggleNode={toggleNode}
                  MAX_DEPTH={MAX_DEPTH}
                  fetchChildren={fetchChildren}
                  l1Progress={l1Progress}
                  fetchL1Progress={fetchL1Progress}
                />
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto max-w-4xl px-4 py-2.5 grid grid-cols-2 gap-2">
          <button
            onClick={handleCopy}
            className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 shadow-sm"
            title="Copy your referral link"
          >
            Copy Invite Link
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              "Ready to be an India Founder? Register using this link and start building team India\n\n" +
                referralLink()
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 text-center font-medium shadow-sm"
            title="Share on WhatsApp"
          >
            Share on Whatsapp
          </a>
        </div>
      </div>

      {/* Help sheet */}
      {showHelp && (
        <div className="fixed inset-0 z-[70]">
          <button
            aria-label="Close"
            onClick={() => setShowHelp(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:w-[560px]">
            <div className="rounded-t-2xl sm:rounded-2xl border border-gray-100 bg-white shadow-xl p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-semibold text-gray-900">How it works</h4>
                <button
                  onClick={() => setShowHelp(false)}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
              <ol className="mt-3 list-decimal pl-5 space-y-2 text-sm text-gray-700">
                <li>Invite with your QR or the bottom bar.</li>
                <li>New registrations appear in <strong>Level 1</strong>.</li>
                <li>Finish <strong>Mission 1</strong> (10/10), then help <strong>3</strong> L1 leaders reach <strong>10/10</strong> (Mission 2).</li>
                <li>Multiply into <strong>Level 2</strong>: support <strong>3</strong> leaders to reach <strong>10/10</strong> (Mission 3).</li>
                <li>Tap <strong>+</strong> to drill into deeper levels. Open a row to view phone & WhatsApp.</li>
              </ol>

              {/* NEW: Inline CTA inside help */}
              <div className="mt-4">
                <a
                  href="/train/sponsor"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-semibold hover:bg-indigo-700 active:scale-[0.99] shadow-sm"
                >
                  📘 Learn how to sponsor
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // simple predicate (kept for future search reuse)
  function nodeMatches(u) {
    const hay = `${normalize(u.name)} ${normalize(u.email)} ${normalize(u.referralId)}`;
    return !!hay;
  }
}

/** ===== Mission card with animated ring + lock state ===== */
function MissionWide({ title, subtitle, progress, pct, locked = false }) {
  const [displayPct, setDisplayPct] = useState(0);
  useEffect(() => {
    let raf;
    let start;
    const from = displayPct;
    const to = pct || 0;
    const duration = 500;
    const step = (ts) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const val = Math.round(from + (to - from) * t);
      setDisplayPct(val);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  const color = colorForPct(displayPct, locked);
  const R = 48;
  const C = 2 * Math.PI * R;
  const off = C * (1 - (displayPct || 0) / 100);

  return (
    <div className={`rounded-2xl border ${locked ? "border-gray-100" : "border-gray-100"} bg-white p-4 shadow-sm relative overflow-hidden`}>
      {/* subtle corner sheen */}
      <div className="pointer-events-none absolute -top-10 -right-12 h-28 w-28 rounded-full bg-gradient-to-tr from-white/0 via-white/30 to-white/0 blur-2xl" />
      {locked && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] rounded-2xl grid place-items-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-full shadow-sm">
            <span>🔒</span> Locked
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        {/* Left: big ring */}
        <div className="relative w-[112px] h-[112px]" title={`${displayPct}%`}>
          <svg className="w-[112px] h-[112px]">
            <circle
              className="text-gray-200"
              strokeWidth="8"
              stroke="currentColor"
              fill="transparent"
              r={R}
              cx="56"
              cy="56"
            />
            <circle
              className={color.ring}
              strokeWidth="8"
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r={R}
              cx="56"
              cy="56"
              strokeDasharray={C}
              strokeDashoffset={off}
              style={{ transition: "stroke-dashoffset 400ms ease" }}
            />
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center text-sm font-extrabold ${color.text}`}>
            {progress}
          </div>
        </div>

        {/* Right: title + copy */}
        <div className={`min-w-0 ${locked ? "opacity-70" : ""}`}>
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          {subtitle && <p className="mt-1 text-xs text-gray-600">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function colorForPct(p, locked = false) {
  if (locked) return { ring: "text-gray-300", text: "text-gray-500" };
  if (p >= 100) return { ring: "text-green-500", text: "text-green-700" };
  if (p >= 75) return { ring: "text-blue-500", text: "text-blue-700" };
  if (p >= 40) return { ring: "text-amber-500", text: "text-amber-700" };
  if (p > 0) return { ring: "text-red-400", text: "text-red-600" };
  return { ring: "text-gray-300", text: "text-gray-600" };
}

/** ===== Team tree ===== */
function TreeChildren({
  parentId,
  level,
  childrenCache,
  nodePages,
  expanded,
  toggleNode,
  MAX_DEPTH,
  fetchChildren,
  l1Progress,
  fetchL1Progress,
}) {
  const kids = childrenCache[parentId] || [];
  const manyRows = kids.length > VIRTUALIZE_THRESHOLD;

  const parentRef = useRef(null);
  const loadMoreRef = useRef(null);

  // Always call hook; count=0 when not manyRows to satisfy Rules of Hooks
  const rowVirtualizer = useVirtualizer({
    count: manyRows ? kids.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 68,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Fetch visible L1 progress lazily
  useEffect(() => {
    if (level !== 1) return;
    kids.slice(0, 120).forEach((u) => {
      if (l1Progress[u.id] === undefined) fetchL1Progress?.(u.id);
    });
  }, [level, kids, l1Progress, fetchL1Progress]);

  const hasMore = !!nodePages[parentId]?.hasMore;

  // Auto-load more
  useEffect(() => {
    if (!hasMore) return;
    const rootEl = manyRows ? parentRef.current : null;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchChildren(parentId, { append: true });
      },
      { root: rootEl, rootMargin: "200px" }
    );
    if (loadMoreRef.current) io.observe(loadMoreRef.current);
    return () => io.disconnect();
  }, [hasMore, parentId, manyRows, fetchChildren]);

  const badgeStyle = (n) => {
    if (n === undefined) return "bg-gray-50 text-gray-500 border-gray-200";
    if (n >= 10) return "bg-green-50 text-green-700 border-green-200";
    if (n >= 8) return "bg-blue-50 text-blue-700 border-blue-200";
    if (n >= 4) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-red-50 text-red-700 border-red-200";
  };

  // Small list
  if (!manyRows) {
    return (
      <div className="relative">
        <ul className="divide-y divide-gray-100">
          {kids.map((u, idx) => {
            const isOpen = expanded.has(u.id);
            const canDrill = level < MAX_DEPTH;
            const phoneDigits = String(u.phone || "").replace(/\D/g, "");
            const badge = level === 1 ? l1Progress[u.id] : undefined;

            return (
              <li key={u.id} className={`py-2.5 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                <div className="flex items-start gap-3">
                  {canDrill ? (
                    <button
                      onClick={() => toggleNode(u.id, level + 1)}
                      className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-[0.98] transition"
                      title={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? "−" : "+"}
                    </button>
                  ) : (
                    <div className="h-9 w-9" />
                  )}

                  <div className="flex-1 min-w-0 rounded">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                        L{level}
                      </span>
                      <span className="font-medium text-gray-900 truncate text-sm">
                        {u.name || "Unnamed"}
                      </span>

                      {badge !== undefined && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border ${badgeStyle(
                            badge
                          )}`}
                          title="Their own Level 1 progress"
                        >
                          {badge >= 10 && <span aria-hidden>🏆</span>}
                          {`${badge}/10`}
                        </span>
                      )}
                    </div>

                    {isOpen && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-700">
                        {phoneDigits && (
                          <>
                            <span className="font-mono">{u.phone}</span>
                            <a
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 border border-emerald-100 hover:bg-emerald-100"
                              href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(
                                `Hi ${u.name || ""},`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Message on WhatsApp"
                            >
                              WhatsApp
                            </a>
                          </>
                        )}
                        <span className="opacity-40 hidden sm:inline">•</span>
                        <span className="font-mono text-blue-700 truncate">{u.referralId}</span>
                      </div>
                    )}
                  </div>
                </div>

                {isOpen && canDrill && (
                  <div className="mt-2 ml-5 border-l border-gray-100 pl-3">
                    <TreeChildren
                      parentId={u.id}
                      level={level + 1}
                      childrenCache={childrenCache}
                      nodePages={nodePages}
                      expanded={expanded}
                      toggleNode={toggleNode}
                      MAX_DEPTH={MAX_DEPTH}
                      fetchChildren={fetchChildren}
                      l1Progress={l1Progress}
                      fetchL1Progress={fetchL1Progress}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {hasMore && (
          <div
            ref={loadMoreRef}
            className="h-8 w-full flex items-center justify-center text-xs text-gray-500"
          >
            Loading more…
          </div>
        )}
      </div>
    );
  }

  // Virtualized list (very large)
  return (
    <div className="relative">
      <div ref={parentRef} className="overflow-auto overflow-x-hidden" style={{ maxHeight: 560 }}>
        <ul className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const u = kids[vi.index];
            const isOpen = expanded.has(u.id);
            const canDrill = level < MAX_DEPTH;
            const phoneDigits = String(u.phone || "").replace(/\D/g, "");
            const badge = level === 1 ? l1Progress[u.id] : undefined;

            return (
              <li
                key={u.id}
                ref={rowVirtualizer.measureElement}
                className={`absolute left-0 right-0 ${vi.index % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                <div className="py-2.5 border-b border-gray-100">
                  <div className="flex items-start gap-3">
                    {canDrill ? (
                      <button
                        onClick={() => toggleNode(u.id, level + 1)}
                        className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-[0.98] transition"
                        title={isOpen ? "Collapse" : "Expand"}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    ) : (
                      <div className="h-9 w-9" />
                    )}

                    <div className="flex-1 min-w-0 rounded">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                          L{level}
                        </span>
                        <span className="font-medium text-gray-900 truncate text-sm">
                          {u.name || "Unnamed"}
                        </span>

                        {badge !== undefined && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border ${badgeStyle(
                              badge
                            )}`}
                            title="Their own Level 1 progress"
                          >
                            {badge >= 10 && <span aria-hidden>🏆</span>}
                            {`${badge}/10`}
                          </span>
                        )}
                      </div>

                      {isOpen && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-700">
                          {phoneDigits && (
                            <>
                              <span className="font-mono">{u.phone}</span>
                              <a
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 border border-emerald-100 hover:bg-emerald-100"
                                href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(
                                  `Hi ${u.name || ""},`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Message on WhatsApp"
                              >
                                WhatsApp
                              </a>
                            </>
                          )}
                          <span className="opacity-40 hidden sm:inline">•</span>
                          <span className="font-mono text-blue-700 truncate">{u.referralId}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isOpen && canDrill && (
                    <div className="mt-2 ml-5 border-l border-gray-100 pl-3">
                      <TreeChildren
                        parentId={u.id}
                        level={level + 1}
                        childrenCache={childrenCache}
                        nodePages={nodePages}
                        expanded={expanded}
                        toggleNode={toggleNode}
                        MAX_DEPTH={MAX_DEPTH}
                        fetchChildren={fetchChildren}
                        l1Progress={l1Progress}
                        fetchL1Progress={fetchL1Progress}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}

          {hasMore && (
            <li
              ref={loadMoreRef}
              className="absolute left-0 right-0 h-10 flex items-center justify-center text-xs text-gray-500"
              style={{ transform: `translateY(${rowVirtualizer.getTotalSize() - 40}px)` }}
            >
              Loading more…
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

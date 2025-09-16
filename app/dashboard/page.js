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
const L1_GOAL = 10;
const HELP_TARGET = 3;
const VIRTUALIZE_THRESHOLD = 150; // only virtualize when a level shows many rows

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
  const [childrenCache, setChildrenCache] = useState({});
  const [parentOf, setParentOf] = useState({});
  const [expanded, setExpanded] = useState(new Set());
  const [nodePages, setNodePages] = useState({}); // parentUid -> { items, cursor, hasMore }

  /** ===== L1 progress cache (x/10) ===== */
  const [l1Progress, setL1Progress] = useState({});

  /** ===== Clipboard / QR ===== */
  const [copySuccess, setCopySuccess] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrSize, setQrSize] = useState(120);
  const qrBoxRef = useRef(null);

  /** ===== Help sheet ===== */
  const [showHelp, setShowHelp] = useState(false);

  /** ===== Helpers ===== */
  const normalize = (s) => String(s || "").toLowerCase();
  const referralLink = () => {
    if (!userData?.referralId && typeof window === "undefined") return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/register?ref=${userData?.referralId || ""}`;
  };
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 18) return "Good Afternoon";
    return "Good Evening";
  };
  const handleCopy = () => {
    if (!userData?.referralId) return;
    const link = referralLink();
    navigator.clipboard.writeText(link).then(() => {
      setCopySuccess("Referral link copied!");
      setTimeout(() => setCopySuccess(""), 1800);
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

  /** ===== QR: responsive size ===== */
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

  /** ===== QR: generate dataURL ===== */
  useEffect(() => {
    const link = referralLink();
    if (!link) return;
    QRCode.toDataURL(link, { width: qrSize, margin: 0, errorCorrectionLevel: "M" })
      .then((url) => setQrDataUrl(url))
      .catch((e) => {
        console.error("QR generate failed", e);
        setQrDataUrl("");
      });
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

  /** ===== L1 progress (badge) ===== */
  async function fetchL1Progress(uid) {
    if (l1Progress[uid] !== undefined) return l1Progress[uid];
    const qy = query(collection(db, "users"), where("upline", "==", uid), limit(11));
    const snap = await getDocs(qy);
    const count = Math.min(10, snap.size >= 10 ? 10 : snap.size);
    setL1Progress((prev) => ({ ...prev, [uid]: count }));
    return count;
  }

  /** Mission 2: completed L1s (>=10) */
  const completedL1 = useMemo(() => {
    const kids = childrenCache[currentUid] || [];
    let c = 0;
    for (const kid of kids) {
      const n = l1Progress[kid.id];
      if (n !== undefined && n >= 10) c++;
    }
    return c;
  }, [childrenCache, currentUid, l1Progress]);

  const goalDone = (counts.levels?.["1"] || 0) >= L1_GOAL;
  const goalPct = Math.min(100, Math.round(((counts.levels?.["1"] || 0) / L1_GOAL) * 100));

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
      <header className="bg-blue-600 text-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Team Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="rounded-md bg-blue-500/70 px-3 py-1.5 text-sm hover:bg-blue-500"
              title="How it works"
            >
              Help
            </button>
            <button
              onClick={async () => {
                await signOut(auth);
                router.push("/login");
              }}
              className="rounded-md bg-blue-500/70 px-3 py-1.5 text-sm hover:bg-blue-500"
              title="Log out"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {/* ===== Hero: guidance + QR (no share buttons here) ===== */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-600">{greeting()},</p>
              <h2 className="mt-0.5 text-xl font-bold text-gray-900 truncate">
                {userData?.name || "India Founder"}
              </h2>

              {/* New guidance copy */}
              <p className="mt-2 text-sm text-gray-700">
                Start building your network now. Complete <strong>Mission 1</strong> by sponsoring your first
                <strong> 10 India Founders</strong>; then unlock <strong>Mission 2</strong> to grow leaders in your team.
              </p>

              {dashError && (
                <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 border border-amber-200">
                  {dashError}
                </div>
              )}
            </div>

            {/* QR (no icon buttons below; sharing lives in sticky bar) */}
            <div className="shrink-0" id="qrShareBlock">
              <div
                ref={qrBoxRef}
                className="rounded-2xl border border-gray-100 bg-white shadow-sm p-3 flex flex-col items-center w-[140px] sm:w-[160px]"
                title="Share this to invite"
              >
                <div className="text-[11px] font-medium text-gray-600 mb-2">Invite with QR</div>
                <div className="rounded-2xl overflow-hidden shadow-sm ring-1 ring-gray-100">
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
              </div>
            </div>
          </div>

          {/* Mini-card: Total team size */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStatCard label="Total team size" value={counts.total} />
          </div>
        </section>

        {/* ===== Missions (no buttons; bigger, colored rings; ring left, text right) ===== */}
        <section className="mt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <MissionWide
              title="Mission 1: Sponsor 10 India Founders"
              subtitle="Invite Founders to your Level 1 and reach 10/10 to unlock Team Growth."
              progress={`${counts.levels?.["1"] || 0}/10`}
              pct={goalPct}
              color={goalPct >= 100 ? "green" : goalPct >= 60 ? "blue" : goalPct > 0 ? "amber" : "gray"}
            />

            {goalDone && (
              <MissionWide
                title="Mission 2: Team Growth"
                subtitle="Help 3 of your Level 1 each sponsor their 10. Build leaders, not just numbers."
                progress={`${Math.min(HELP_TARGET, completedL1)}/3`}
                pct={Math.min(100, Math.round((completedL1 / HELP_TARGET) * 100))}
                color={
                  completedL1 >= HELP_TARGET
                    ? "green"
                    : completedL1 >= 2
                    ? "blue"
                    : completedL1 >= 1
                    ? "amber"
                    : "gray"
                }
              />
            )}
          </div>
        </section>

        {/* ===== Team ===== */}
        <section
          id="teamSection"
          className="mt-8 rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Your Team</h3>
            {treeLoading && <span className="text-xs text-gray-500">Loading…</span>}
          </div>

          {treeError && (
            <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {treeError}
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
                  // progress props
                  l1Progress={l1Progress}
                  fetchL1Progress={fetchL1Progress}
                />
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Sticky bottom action bar — only two buttons with exact labels requested */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto max-w-4xl px-4 py-2.5 grid grid-cols-2 gap-2">
          <button
            onClick={handleCopy}
            className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700"
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
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 text-center font-medium"
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
                <li>Use the bottom bar to copy your link or share on WhatsApp.</li>
                <li>Registrations show in your <strong>Level 1</strong>.</li>
                <li>Finish <strong>Mission 1 (10/10)</strong>, then help <strong>3</strong> Level 1 reach <strong>10/10</strong>.</li>
                <li>Tap <strong>+</strong> to drill into deeper levels; open a row to see phone & WhatsApp.</li>
              </ol>
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

/** ===== Small UI bits ===== */

function MiniStatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
      <div className="text-[11px] font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

// Big, colored mission ring with text to the right
function MissionWide({ title, subtitle, progress, pct, color = "blue" }) {
  // ring size
  const R = 48;                 // radius
  const C = 2 * Math.PI * R;    // circumference
  const off = C * (1 - (pct || 0) / 100);

  const colors = {
    green: { ring: "text-green-500", text: "text-green-700" },
    blue: { ring: "text-blue-500", text: "text-blue-700" },
    amber: { ring: "text-amber-500", text: "text-amber-700" },
    gray: { ring: "text-gray-300", text: "text-gray-600" },
  };
  const cl = colors[color] || colors.blue;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        {/* Left: big ring */}
        <div className="relative w-[112px] h-[112px]" title={`${pct || 0}%`}>
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
              className={cl.ring}
              strokeWidth="8"
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r={R}
              cx="56"
              cy="56"
              strokeDasharray={C}
              strokeDashoffset={off}
            />
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center text-sm font-extrabold ${cl.text}`}>
            {progress}
          </div>
        </div>

        {/* Right: title + copy */}
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          {subtitle && <p className="mt-1 text-xs text-gray-600">{subtitle}</p>}
          {/* No CTA button here by design */}
        </div>
      </div>
    </div>
  );
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

  // Always call hook (safe for Rules of Hooks); count=0 disables work when not manyRows
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

  // Small list (default)
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

                    {/* Phone/WhatsApp only when expanded (mobile friendly) */}
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

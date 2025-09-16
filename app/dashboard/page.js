"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc, getDoc, collection, query, where, getDocs, orderBy, limit, startAfter,
} from "firebase/firestore";
import { useVirtualizer } from "@tanstack/react-virtual";
import QRCode from "qrcode";

/** ===== Constants ===== */
const MAX_DEPTH = 6;
const PAGE_SIZE = 50;
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
  const [childrenCache, setChildrenCache] = useState({}); // parentUid -> children[]
  const [parentOf, setParentOf] = useState({});            // childUid -> parentUid
  const [expanded, setExpanded] = useState(new Set());     // expanded node IDs
  const [expandLevel, setExpandLevel] = useState(1);       // for dropdown
  const [nodePages, setNodePages] = useState({});          // parentUid -> { items, cursor, hasMore }

  /** ===== L1 progress (x/10) ===== */
  const [l1Progress, setL1Progress] = useState({});        // userUid -> number (0..10+)
  const [focusHelp3, setFocusHelp3] = useState(false);     // (kept for future toggles)

  /** ===== Search ===== */
  const [search, setSearch] = useState("");
  const searchDebounce = useRef(null);
  const hasActiveSearch = useMemo(() => search.trim().length >= 2, [search]);

  /** ===== Clipboard / QR ===== */
  const [copySuccess, setCopySuccess] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrSize, setQrSize] = useState(120);
  const qrBoxRef = useRef(null);
  const iconPx = Math.min(28, Math.max(18, Math.floor(qrSize * 0.18)));

  /** ===== Helpers ===== */
  function normalize(s) {
    return String(s || "").toLowerCase();
  }
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

  /** ===== User & counts ===== */
  async function loadUser(uid) {
    try {
      const meSnap = await getDoc(doc(db, "users", uid));
      if (!meSnap.exists()) {
        setDashError("User not found.");
        setLoading(false);
        return;
      }
      const me = meSnap.data();
      setUserData(me);

      if (me.upline) {
        const upSnap = await getDoc(doc(db, "users", me.upline));
        if (upSnap.exists()) setUpline(upSnap.data());
      }
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

  /** ===== QR container observer ===== */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = qrBoxRef.current;
    if (!el || !("ResizeObserver" in window)) {
      const w = window.innerWidth || 1024;
      const s = w < 380 ? 96 : w < 640 ? 120 : 160;
      setQrSize(s);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = entry.contentRect.width || 140;
        const s = Math.max(96, Math.min(200, Math.floor(cw - 12)));
        setQrSize(s);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** ===== QR generator ===== */
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

  /** ===== Tree data ===== */
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
      setExpandLevel(targetLevel);
    } catch (e) {
      console.error(e);
      setTreeError("Expand failed.");
    } finally {
      setTreeLoading(false);
    }
  }

  function collapseAll() {
    setExpanded(new Set());
    setExpandLevel(0);
  }

  /** ===== Search (server-assisted) ===== */
  async function handleSearchChange(val) {
    setSearch(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);

    searchDebounce.current = setTimeout(async () => {
      const q = normalize(val);
      if (!q || q.length < 2) {
        if (expandLevel > 0) await expandToLevel(expandLevel);
        else collapseAll();
        return;
      }
      try {
        setTreeLoading(true);
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Search failed");

        const toExpand = new Set(expanded);
        if (currentUid) toExpand.add(currentUid);

        for (const hit of payload.results || []) {
          const path = hit.path || [];
          for (const pid of path) {
            await fetchChildren(pid);
            toExpand.add(pid);
          }
          if (hit.user?.upline) {
            await fetchChildren(hit.user.upline);
            toExpand.add(hit.user.upline);
          }
        }
        setExpanded(toExpand);
      } catch (e) {
        console.error(e);
        setTreeError("Search failed.");
      } finally {
        setTreeLoading(false);
      }
    }, 250);
  }

  /** ===== L1 progress helpers ===== */
  async function fetchL1Progress(uid) {
    // Return cached if present
    if (l1Progress[uid] !== undefined) return l1Progress[uid];

    // Count up to 10 (we only need to know if they reached 10)
    const qy = query(collection(db, "users"), where("upline", "==", uid), limit(11));
    const snap = await getDocs(qy);
    const count = Math.min(10, snap.size >= 10 ? 10 : snap.size);
    setL1Progress((prev) => ({ ...prev, [uid]: count }));
    return count;
  }

  // For Mission 2: compute how many L1 have reached 10
  const l1Children = childrenCache[currentUid] || [];
  const completedL1 = useMemo(() => {
    let c = 0;
    for (const kid of l1Children) {
      const n = l1Progress[kid.id];
      if (n !== undefined && n >= 10) c++;
    }
    return c;
  }, [l1Children, l1Progress]);

  const goalDone = (counts.levels?.["1"] || 0) >= L1_GOAL;
  const goalPct = Math.min(
    100,
    Math.round(((counts.levels?.["1"] || 0) / L1_GOAL) * 100)
  );

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
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Team Dashboard</h1>
          <button
            onClick={async () => { await signOut(auth); router.push("/login"); }}
            className="rounded-md bg-blue-500/70 px-3 py-1.5 text-sm hover:bg-blue-500"
            title="Log out of your account"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        {/* Identity */}
        <section className="rounded-2xl border border-gray-100 bg-white/80 shadow-sm p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: greeting & IDs */}
            <div className="space-y-1">
              <div className="text-base sm:text-lg font-medium text-gray-900">
                <span className="text-gray-700">{greeting()}, </span>
                <span className="font-bold">{userData?.name}</span>
              </div>
              {/* Show email now (requested) */}
              {userData?.email && (
                <div className="text-xs text-gray-500">{userData.email}</div>
              )}
              <div className="text-sm text-gray-600">
                Referral ID:{" "}
                <span className="font-mono text-blue-700">{userData?.referralId}</span>
              </div>
              {upline && (
                <div className="text-xs text-gray-500">
                  Upline: {upline.name}{" "}
                  <span className="font-mono text-blue-600">({upline.referralId})</span>
                </div>
              )}
              {dashError && (
                <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 border border-amber-200">
                  {dashError}
                </div>
              )}
            </div>

            {/* Right: QR card with icon-only actions */}
            <div className="self-start sm:self-auto w-full sm:w-auto" id="qrShareBlock">
              <div
                ref={qrBoxRef}
                className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 flex flex-col items-center w-full sm:w-auto"
                title="Share this to invite"
              >
                <div className="text-xs font-medium text-gray-600 mb-2">Invite with QR</div>

                <div className="flex flex-col items-center" style={{ width: qrSize }}>
                  <div className="rounded-2xl overflow-hidden shadow-sm ring-1 ring-gray-100">
                    <img
                      src={qrDataUrl || "data:image/gif;base64,R0lGODlhAQABAAAAACw="}
                      alt="Referral QR"
                      width={qrSize}
                      height={qrSize}
                      className="block"
                      style={{ width: qrSize, height: qrSize }}
                    />
                  </div>

                  {/* Icon bar under QR */}
                  <div className="mt-2 grid grid-cols-2 gap-2 w-full">
                    <button
                      onClick={handleCopy}
                      aria-label="Copy referral link"
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 transition flex items-center justify-center"
                      title="Copy referral link"
                      style={{ height: Math.max(36, Math.floor(qrSize * 0.28)) }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width={iconPx}
                        height={iconPx}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        "Ready to be an India Founder? Register using this link and start building team India\n\n" + referralLink()
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Share on WhatsApp"
                      className="rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition flex items-center justify-center"
                      title="Share on WhatsApp"
                      style={{ height: Math.max(36, Math.floor(qrSize * 0.28)) }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width={iconPx}
                        height={iconPx}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="text-emerald-700"
                      >
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
          </div>
        </section>

        {/* Stats — stronger colors */}
        <section className="mt-6 text-center">
          <StatCard label="Total Downlines" value={counts.total} tone="green" />
          <div className="mt-3 -mx-1 overflow-x-auto">
            <div className="flex justify-center gap-2 px-1 pb-1" id="levelPills" title="Levels = how far down the team goes">
              {[1, 2, 3, 4, 5].map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 font-semibold"
                >
                  L{l}
                  <span className="ml-1.5">{counts.levels[String(l)] || 0}</span>
                </span>
              ))}
              <span className="inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-3 py-1 text-xs text-purple-700 font-semibold">
                6+
                <span className="ml-1.5">{counts.sixPlus || 0}</span>
              </span>
            </div>
          </div>

          {counts.total === 0 && (
            <div className="mx-auto mt-4 max-w-md rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              No team yet. Share your link to add your <strong>Level 1</strong>.
            </div>
          )}
        </section>

        {/* ===== Missions (replaces old checklist) ===== */}
        <section className="mt-6">
          <div className="rounded-2xl border border-gray-100 bg-white/80 shadow-sm p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Mission 1 */}
              <MissionCard
                title="Mission 1: Sponsor 10 India Founders"
                subtitle="Work on sponsoring your first 10 India Founders"
                progress={`${counts.levels?.["1"] || 0}/10`}
                pct={goalPct}
                done={goalDone}
                locked={false}
                ctaLabel="Copy Link"
                onCta={handleCopy}
              />

              {/* Mission 2 — only show after Mission 1 completed */}
              {goalDone && (
                <MissionCard
                  title="Mission 2: Team Growth"
                  subtitle="Help 3 of your founders to sponsor 10"
                  progress={`${Math.min(HELP_TARGET, completedL1)}/3`}
                  pct={Math.min(100, Math.round((completedL1 / 3) * 100))}
                  done={completedL1 >= 3}
                  locked={false}
                  ctaLabel="View Level 1"
                  onCta={async () => {
                    await expandToLevel(1);
                    document.getElementById("teamSection")?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              )}
            </div>
          </div>
        </section>

        {/* Team / Tree */}
        <section id="teamSection" className="mt-8 rounded-2xl border border-gray-100 bg-white/80 shadow-sm p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                Your Team (Tap + to open)
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Minimal indent for drill down. Search by name / ID.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                id="searchInput"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search a name or ID…"
                className="w-full sm:w-60 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Try a name or NU-ID"
              />
              <select
                value={expandLevel}
                onChange={async (e) => {
                  const val = Number(e.target.value);
                  if (val === 0) collapseAll();
                  else await expandToLevel(val);
                }}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Open more levels at once"
              >
                <option value={0}>Collapse all</option>
                <option value={1}>Expand to Level 1</option>
                <option value={2}>Expand to Level 2</option>
                <option value={3}>Expand to Level 3</option>
                <option value={4}>Expand to Level 4</option>
                <option value={5}>Expand to Level 5</option>
                <option value={6}>Expand to Level 6 (All)</option>
              </select>
            </div>
          </div>

          {treeError && (
            <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {treeError}
            </div>
          )}

          {/* Root (L0) */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <button
                id="expandRootBtn"
                onClick={() => toggleNode(currentUid, 1)}
                disabled={treeLoading}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-[0.98] transition"
                title={expanded.has(currentUid) ? "Collapse" : "Expand"}
              >
                {expanded.has(currentUid) ? "−" : "+"}
              </button>
              <div className="flex flex-col min-w-0">
                <div className="text-sm sm:text-base font-medium text-gray-900 truncate">
                  <span className="mr-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">
                    L0
                  </span>
                  {userData?.name || "You"}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  <span className="font-mono text-blue-700">{userData?.referralId}</span>
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
                  hasActiveSearch={hasActiveSearch}
                  nodeMatches={nodeMatches}
                  isNodeOrDescendantMatch={isNodeOrDescendantMatch}
                  // progress props
                  l1Progress={l1Progress}
                  fetchL1Progress={fetchL1Progress}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto max-w-4xl px-4 py-2.5 flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 rounded-xl bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700"
            title="Copy your referral link"
          >
            Copy Link
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              "Ready to be an India Founder? Register using this link and start building team India\n\n" + referralLink()
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 text-center font-medium"
            title="Share on WhatsApp"
          >
            WhatsApp
          </a>
          <a
            href="#teamSection"
            onClick={async (e) => {
              e.preventDefault();
              await expandToLevel(1);
              document.getElementById("teamSection")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-center font-medium"
            title="Open your team"
          >
            Open Team
          </a>
        </div>
      </div>
    </div>
  );

  /** ===== Predicates for search highlighting ===== */
  function nodeMatches(u) {
    const q = normalize(search);
    if (q.length < 2) return true;
    const hay = `${normalize(u.name)} ${normalize(u.email)} ${normalize(u.referralId)}`;
    return hay.includes(q);
  }
  function isNodeOrDescendantMatch(nodeId) {
    const par = parentOf[nodeId];
    if (par && childrenCache[par]) {
      const me = childrenCache[par].find((x) => x.id === nodeId);
      if (me && nodeMatches(me)) return true;
    }
    const kids = childrenCache[nodeId] || [];
    for (const k of kids) {
      if (nodeMatches(k)) return true;
      if (isNodeOrDescendantMatch(k.id)) return true;
    }
    return false;
  }
}

/** ===== Mission Card (big ring + tooltip) ===== */
function MissionCard({ title, subtitle, progress, pct, done, locked, ctaLabel, onCta }) {
  const R = 34; // ring radius for ~80px
  const C = 2 * Math.PI * R;
  const off = C * (1 - (pct || 0) / 100);

  return (
    <div className={`rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm ${locked ? "opacity-50" : ""}`} title="Mission progress">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-gray-600">{subtitle}</p>}

      <div className="mt-2 flex items-center gap-3">
        <div className="relative w-20 h-20" title={`${pct || 0}%`}>
          <svg className="w-20 h-20">
            <circle className="text-gray-200" strokeWidth="6" stroke="currentColor" fill="transparent" r={R} cx="40" cy="40" />
            <circle
              className={done ? "text-green-500" : "text-blue-500"}
              strokeWidth="6"
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r={R}
              cx="40"
              cy="40"
              strokeDasharray={C}
              strokeDashoffset={off}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{progress}</div>
        </div>

        <button
          onClick={onCta}
          disabled={locked}
          className="flex-1 rounded-xl bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300"
          title={locked ? "Unlock by completing previous mission" : "Go"}
        >
          {locked ? "Locked" : ctaLabel}
        </button>
      </div>
    </div>
  );
}

/** ===== Small Components ===== */
function StatCard({ label, value, tone }) {
  const tones = {
    green: "bg-green-50 text-green-700 border-green-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
  };
  return (
    <div className={`mx-auto max-w-xs rounded-2xl border ${tones[tone] || "border-gray-100"} p-4 text-center shadow-sm`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

/** ===== TreeChildren with colored L1 badges, champion 🏆, phone shown when expanded, and auto-load more ===== */
function TreeChildren({
  parentId,
  level,
  childrenCache,
  nodePages,
  expanded,
  toggleNode,
  MAX_DEPTH,
  fetchChildren,
  hasActiveSearch,
  nodeMatches,
  isNodeOrDescendantMatch,
  l1Progress,
  fetchL1Progress,
}) {
  const kids = childrenCache[parentId] || [];
  const filteredKids = hasActiveSearch ? kids.filter((u) => isNodeOrDescendantMatch(u.id)) : kids;
  const manyRows = filteredKids.length > 60;

  // Progress fetch for visible Level 1 items
  useEffect(() => {
    if (level !== 1) return;
    const toFetch = filteredKids.slice(0, 100);
    toFetch.forEach((u) => {
      if (l1Progress[u.id] === undefined) {
        fetchL1Progress?.(u.id);
      }
    });
  }, [level, filteredKids, l1Progress, fetchL1Progress]);

  // Helper: badge color + champion
  function badgeStyle(n) {
    if (n === undefined) return "bg-gray-50 text-gray-500 border-gray-200";
    if (n >= 10) return "bg-green-50 text-green-700 border-green-200";
    if (n >= 8) return "bg-blue-50 text-blue-700 border-blue-200";
    if (n >= 4) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-red-50 text-red-700 border-red-200";
  }

  /** ===== Auto-load sentinel ===== */
  const parentRef = useRef(null);
  const loadMoreRef = useRef(null);
  useEffect(() => {
    if (!nodePages[parentId]?.hasMore) return;
    const rootEl = manyRows ? parentRef.current : null; // for virtualized use container; otherwise viewport
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchChildren(parentId, { append: true });
        }
      },
      { root: rootEl, rootMargin: "200px" }
    );
    if (loadMoreRef.current) io.observe(loadMoreRef.current);
    return () => io.disconnect();
  }, [nodePages[parentId]?.hasMore, parentId, manyRows, fetchChildren]);

  if (filteredKids.length === 0 && !(nodePages[parentId]?.hasMore)) {
    return (
      <div className="text-xs sm:text-sm text-gray-500 ml-1 sm:ml-2 py-1">
        (no members at level {level}) — share your link to grow this level
      </div>
    );
  }

  // Non-virtualized list
  if (!manyRows) {
    return (
      <div className="relative">
        <ul className="divide-y divide-gray-100">
          {filteredKids.map((u, idx) => {
            const isOpen = expanded.has(u.id);
            const canDrill = level < MAX_DEPTH;
            const highlight = hasActiveSearch && nodeMatches(u);
            const phoneDigits = String(u.phone || "").replace(/\D/g, "");
            const badge = level === 1 ? l1Progress[u.id] : undefined;

            return (
              <li key={u.id} className={`py-2 sm:py-2.5 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                <div className="flex items-start sm:items-center justify-between gap-2">
                  <div className="flex items-start sm:items-center gap-2 min-w-0">
                    {canDrill ? (
                      <button
                        onClick={() => toggleNode(u.id, level + 1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-[0.98] transition"
                        title={isOpen ? "Collapse" : "Expand"}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    ) : (
                      <div className="h-7 w-7" />
                    )}

                    <div className={`flex-1 min-w-0 rounded px-1 ${highlight ? "bg-yellow-50" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                          L{level}
                        </span>
                        <span className="font-medium text-gray-900 truncate">
                          {u.name || "Unnamed"}
                        </span>

                        {/* L1 mini progress badge + champion */}
                        {badge !== undefined && (
                          <span
                            className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border ${badgeStyle(badge)}`}
                            title="Their own Level 1 progress"
                          >
                            {badge >= 10 && <span aria-hidden>🏆</span>}
                            {badge !== undefined ? `${badge}/10` : "…/10"}
                          </span>
                        )}
                      </div>

                      {/* Show phone + WhatsApp ONLY when row is opened (mobile-friendly) */}
                      {isOpen && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700">
                          {phoneDigits && (
                            <>
                              <span className="font-mono">{u.phone}</span>
                              <a
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 border border-emerald-100 hover:bg-emerald-100"
                                href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hi ${u.name || ""},`)}`}
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
                </div>

                {isOpen && canDrill && (
                  <div className="mt-2 ml-3 sm:ml-4 border-l border-gray-100 pl-2 sm:pl-3">
                    <TreeChildren
                      parentId={u.id}
                      level={level + 1}
                      childrenCache={childrenCache}
                      nodePages={nodePages}
                      expanded={expanded}
                      toggleNode={toggleNode}
                      MAX_DEPTH={MAX_DEPTH}
                      fetchChildren={fetchChildren}
                      hasActiveSearch={hasActiveSearch}
                      nodeMatches={nodeMatches}
                      isNodeOrDescendantMatch={isNodeOrDescendantMatch}
                      l1Progress={l1Progress}
                      fetchL1Progress={fetchL1Progress}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {nodePages[parentId]?.hasMore && (
          <>
            <div ref={loadMoreRef} className="h-8 w-full flex items-center justify-center text-xs text-gray-500">
              Loading more…
            </div>
          </>
        )}
      </div>
    );
  }

  // Virtualized (large sets)
  const rowVirtualizer = useVirtualizer({
    count: filteredKids.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Virtualized list with sentinel inside scroll container
  return (
    <div className="relative">
      <div ref={parentRef} className="overflow-auto overflow-x-hidden" style={{ maxHeight: 560 }}>
        <ul className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const u = filteredKids[vi.index];
            const isOpen = expanded.has(u.id);
            const canDrill = level < MAX_DEPTH;
            const highlight = hasActiveSearch && nodeMatches(u);
            const phoneDigits = String(u.phone || "").replace(/\D/g, "");
            const badge = level === 1 ? l1Progress[u.id] : undefined;

            return (
              <li
                key={u.id}
                ref={rowVirtualizer.measureElement}
                className={`absolute left-0 right-0 ${vi.index % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                <div className="py-2 sm:py-2.5 border-b border-gray-100">
                  <div className="flex items-start sm:items-center justify-between gap-2">
                    <div className="flex items-start sm:items-center gap-2 min-w-0">
                      {canDrill ? (
                        <button
                          onClick={() => toggleNode(u.id, level + 1)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-[0.98] transition"
                          title={isOpen ? "Collapse" : "Expand"}
                        >
                          {isOpen ? "−" : "+"}
                        </button>
                      ) : (
                        <div className="h-7 w-7" />
                      )}

                      <div className={`flex-1 min-w-0 rounded px-1 ${highlight ? "bg-yellow-50" : ""}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                            L{level}
                          </span>
                          <span className="font-medium text-gray-900 truncate">
                            {u.name || "Unnamed"}
                          </span>

                          {badge !== undefined && (
                            <span
                              className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border ${badgeStyle(badge)}`}
                              title="Their own Level 1 progress"
                            >
                              {badge >= 10 && <span aria-hidden>🏆</span>}
                              {badge !== undefined ? `${badge}/10` : "…/10"}
                            </span>
                          )}
                        </div>

                        {/* Show phone/WA only when expanded */}
                        {isOpen && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700">
                            {phoneDigits && (
                              <>
                                <span className="font-mono">{u.phone}</span>
                                <a
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 border border-emerald-100 hover:bg-emerald-100"
                                  href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hi ${u.name || ""},`)}`}
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
                  </div>

                  {isOpen && canDrill && (
                    <div className="mt-2 ml-3 sm:ml-4 border-l border-gray-100 pl-2 sm:pl-3">
                      <TreeChildren
                        parentId={u.id}
                        level={level + 1}
                        childrenCache={childrenCache}
                        nodePages={nodePages}
                        expanded={expanded}
                        toggleNode={toggleNode}
                        MAX_DEPTH={MAX_DEPTH}
                        fetchChildren={fetchChildren}
                        hasActiveSearch={hasActiveSearch}
                        nodeMatches={nodeMatches}
                        isNodeOrDescendantMatch={isNodeOrDescendantMatch}
                        l1Progress={l1Progress}
                        fetchL1Progress={fetchL1Progress}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}

          {/* Sentinel for virtualized container */}
          {nodePages[parentId]?.hasMore && (
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

  function badgeStyle(n) {
    if (n === undefined) return "bg-gray-50 text-gray-500 border-gray-200";
    if (n >= 10) return "bg-green-50 text-green-700 border-green-200";
    if (n >= 8) return "bg-blue-50 text-blue-700 border-blue-200";
    if (n >= 4) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-red-50 text-red-700 border-red-200";
  }
}

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

const MAX_DEPTH = 6;
const PAGE_SIZE = 50;

export default function DashboardPage() {
  const router = useRouter();

  // Identity
  const [currentUid, setCurrentUid] = useState(null);
  const [userData, setUserData] = useState(null);
  const [upline, setUpline] = useState(null);

  // Loading & errors
  const [loading, setLoading] = useState(true);
  const [dashError, setDashError] = useState("");
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState("");

  // Counts
  const [counts, setCounts] = useState({
    levels: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
    sixPlus: 0,
    total: 0,
  });

  // Tree data
  const [childrenCache, setChildrenCache] = useState({});
  const [parentOf, setParentOf] = useState({});
  const [expanded, setExpanded] = useState(new Set());
  const [expandLevel, setExpandLevel] = useState(1);
  const [nodePages, setNodePages] = useState({});

  // Search
  const [search, setSearch] = useState("");
  const searchDebounce = useRef(null);
  const hasActiveSearch = useMemo(() => search.trim().length >= 2, [search]);

  // Clipboard
  const [copySuccess, setCopySuccess] = useState("");

  // Header dropdown
  const [menuOpen, setMenuOpen] = useState(false);

  // QR: data URL and responsive sizing via ResizeObserver
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrSize, setQrSize] = useState(120);
  const qrBoxRef = useRef(null);

  // Observe the QR container width and derive a size (clamped)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = qrBoxRef.current;
    if (!el || !("ResizeObserver" in window)) {
      // Fallback: compute from window width
      const w = window.innerWidth || 1024;
      const s = w < 380 ? 96 : w < 640 ? 120 : 160;
      setQrSize(s);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = entry.contentRect.width || 140;
        // leave a little padding; clamp to sane bounds for sharpness
        const s = Math.max(96, Math.min(200, Math.floor(cw - 12)));
        setQrSize(s);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Init
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

  function normalize(s) {
    return String(s || "").toLowerCase();
  }

  function waLink(phone, name) {
    const raw = String(phone || "");
    const digits = raw.replace(/\D/g, "");
    const withCc =
      digits.length === 10 ? `91${digits}` : digits.startsWith("0") ? digits.slice(1) : digits;
    const msg = encodeURIComponent(`Hi ${name || ""},`);
    return `https://wa.me/${withCc}?text=${msg}`;
  }

  function referralLink() {
    if (!userData?.referralId && typeof window === "undefined") return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/register?ref=${userData?.referralId || ""}`;
  }

  // Generate QR whenever size or link changes
  useEffect(() => {
    const link = referralLink();
    if (!link) return;
    QRCode.toDataURL(link, {
      width: qrSize,
      margin: 0,
      errorCorrectionLevel: "M",
    })
      .then((url) => setQrDataUrl(url))
      .catch((e) => {
        console.error("QR generate failed", e);
        setQrDataUrl("");
      });
  }, [qrSize, userData?.referralId]);

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
          const path = (hit.path || []);
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

  function nodeMatches(u) {
    const q = normalize(search);
    if (q.length < 2) return true;
    const hay = `${normalize(u.name)} ${normalize(u.referralId)}`;
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

  function handleCopy() {
    if (userData?.referralId) {
      const link = referralLink();
      navigator.clipboard.writeText(link).then(() => {
        setCopySuccess("Referral link copied!");
        setTimeout(() => setCopySuccess(""), 2000);
      });
    }
  }

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 18) return "Good Afternoon";
    return "Good Evening";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-base text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header (non-sticky) */}
      <header className="bg-blue-600 text-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
            Team Dashboard
          </h1>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md bg-blue-500/70 px-3 py-1.5 text-sm font-medium hover:bg-blue-500 focus:outline-none"
            >
              Menu ▾
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-md bg-white text-gray-800 shadow-lg ring-1 ring-black/5">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
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
            </div>

            {/* Right: QR (stacks under info on small screens, responsive size) */}
            <div className="self-start sm:self-auto w-full sm:w-auto">
              <div
                ref={qrBoxRef}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3 flex flex-col items-center w-full sm:w-auto"
              >
                <div className="rounded-xl overflow-hidden shadow-sm">
                  <img
                    src={qrDataUrl || "data:image/gif;base64,R0lGODlhAQABAAAAACw="}
                    alt="Referral QR"
                    width={qrSize}
                    height={qrSize}
                    className="block rounded-xl shadow-sm"
                    style={{ width: qrSize, height: qrSize }}
                  />
                </div>
                <button
                  onClick={handleCopy}
                  className="mt-2 w-full rounded-xl bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700 active:scale-[0.99] transition"
                >
                  Copy Referral Link
                </button>
                {copySuccess && (
                  <span className="mt-1 text-[11px] text-green-600">{copySuccess}</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Stats — centered */}
        <section className="mt-6 text-center">
          <StatCard label="Total Downlines" value={counts.total} tone="green" />
          <div className="mt-3 -mx-1 overflow-x-auto">
            <div className="flex justify-center gap-2 px-1 pb-1">
              {[1, 2, 3, 4, 5].map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-800"
                >
                  L{l}
                  <span className="ml-1.5 font-semibold">
                    {counts.levels[String(l)] || 0}
                  </span>
                </span>
              ))}
              <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs text-purple-700">
                6+
                <span className="ml-1.5 font-semibold">{counts.sixPlus || 0}</span>
              </span>
            </div>
          </div>
        </section>

        {/* Team / Tree (minimal indentation, shaded rows, no createdAt) */}
        <section className="mt-8 rounded-2xl border border-gray-100 bg-white/80 shadow-sm p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                Your Team
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Minimal indent for drill down. Search by name / ID.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search (min 2 chars)…"
                className="w-full sm:w-60 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={expandLevel}
                onChange={async (e) => {
                  const val = Number(e.target.value);
                  if (val === 0) collapseAll();
                  else await expandToLevel(val);
                }}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <TreeChildren parentId={currentUid} level={1} />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );

  // ===== UI components & inner helpers =====

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

  // --- TreeChildren with minimal indentation + shaded rows, no createdAt on right ---
  function TreeChildren({ parentId, level }) {
    const kids = childrenCache[parentId] || [];
    const filteredKids = hasActiveSearch
      ? kids.filter((u) => isNodeOrDescendantMatch(u.id))
      : kids;

    const manyRows = filteredKids.length > 60; // threshold for virtualization

    // Hooks
    const parentRef = useRef(null);
    const rowVirtualizer = useVirtualizer({
      count: filteredKids.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 64,
      overscan: 8,
      measureElement: (el) => el.getBoundingClientRect().height,
    });

    // Empty
    if (filteredKids.length === 0 && !(nodePages[parentId]?.hasMore)) {
      return (
        <div className="text-xs sm:text-sm text-gray-500 ml-1 sm:ml-2 py-1">
          (no members at level {level})
        </div>
      );
    }

    // Non-virtualized (small lists)
    if (!manyRows) {
      return (
        <div className="relative">
          <ul className="divide-y divide-gray-100">
            {filteredKids.map((u, idx) => {
              const isOpen = expanded.has(u.id);
              const canDrill = level < MAX_DEPTH;
              const highlight = hasActiveSearch && nodeMatches(u);
              const phoneClean = String(u.phone || "").trim();

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
                        </div>

                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                          {/* email removed */}
                          {phoneClean && (
                            <a
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 border border-emerald-100 hover:bg-emerald-100"
                              href={waLink(phoneClean, u.name)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Message on WhatsApp"
                            >
                              <span className="text-[11px]">WhatsApp</span>
                            </a>
                          )}
                          <span className="opacity-40 hidden sm:inline">•</span>
                          <span className="font-mono text-blue-700 truncate">{u.referralId}</span>
                        </div>
                      </div>
                    </div>

                    {/* createdAt removed */}
                  </div>

                  {isOpen && canDrill && (
                    <div className="mt-2 ml-3 sm:ml-4 border-l border-gray-100 pl-2 sm:pl-3">
                      <TreeChildren parentId={u.id} level={level + 1} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {nodePages[parentId]?.hasMore && (
            <div className="mt-2">
              <button
                onClick={() => fetchChildren(parentId, { append: true })}
                className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
              >
                Load more…
              </button>
            </div>
          )}
        </div>
      );
    }

    // Virtualized (large sets)
    return (
      <div className="relative">
        <div
          ref={parentRef}
          className="overflow-auto overflow-x-hidden"
          style={{ maxHeight: 560 }}
        >
          <ul className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const u = filteredKids[vi.index];
              const isOpen = expanded.has(u.id);
              const canDrill = level < MAX_DEPTH;
              const highlight = hasActiveSearch && nodeMatches(u);
              const phoneClean = String(u.phone || "").trim();

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
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                            {phoneClean && (
                              <a
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 border border-emerald-100 hover:bg-emerald-100"
                                href={waLink(phoneClean, u.name)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Message on WhatsApp"
                              >
                                <span className="text-[11px]">WhatsApp</span>
                              </a>
                            )}
                            <span className="opacity-40 hidden sm:inline">•</span>
                            <span className="font-mono text-blue-700 truncate">{u.referralId}</span>
                          </div>
                        </div>
                      </div>

                      {/* createdAt removed */}
                    </div>

                    {isOpen && canDrill && (
                      <div className="mt-2 ml-3 sm:ml-4 border-l border-gray-100 pl-2 sm:pl-3">
                        <TreeChildren parentId={u.id} level={level + 1} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {nodePages[parentId]?.hasMore && (
          <div className="mt-2">
            <button
              onClick={() => fetchChildren(parentId, { append: true })}
              className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              Load more…
            </button>
          </div>
        )}
      </div>
    );
  }
}

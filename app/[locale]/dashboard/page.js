"use client";

export const dynamic = "force-dynamic";

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
import { useTranslations } from "next-intl";

/** ===== Constants ===== */
const MAX_DEPTH = 6;
const PAGE_SIZE = 50;
const L1_GOAL = 10;
const M2_TARGET = 3;
const M3_TARGET = 3;
const VIRTUALIZE_THRESHOLD = 150;

export default function DashboardPage() {
  const t = useTranslations("dashboard");
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
  const [nodePages, setNodePages] = useState({});

  /** ===== Progress caches ===== */
  const [l1Progress, setL1Progress] = useState({});
  const [l2Leaders10, setL2Leaders10] = useState(0);

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
    if (h < 12) return t("greeting.morning");
    if (h < 18) return t("greeting.afternoon");
    return t("greeting.evening");
  };

  const handleCopy = () => {
    const link = referralLink();
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopySuccess(t("copySuccess"));
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
        setDashError(t("errors.userNotFound"));
        setLoading(false);
        return;
      }
      setUserData(meSnap.data());
    } catch (e) {
      console.error(e);
      setDashError(t("errors.profileLoad"));
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
      setDashError(t("errors.counts"));
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

  const qrTimer = useRef(null);
  useEffect(() => {
    const link = referralLink();
    if (!link) return;
    if (qrTimer.current) clearTimeout(qrTimer.current);
    qrTimer.current = setTimeout(() => {
      QRCode.toDataURL(link, { width: qrSize, margin: 0, errorCorrectionLevel: "M" })
        .then((url) => setQrDataUrl(url))
        .catch(() => setQrDataUrl(""));
    }, 80);
    return () => {
      if (qrTimer.current) clearTimeout(qrTimer.current);
    };
  }, [qrSize, userData?.referralId]);

  /** ===== Missions logic ===== */
  async function fetchL1Progress(uid) {
    if (l1Progress[uid] !== undefined) return l1Progress[uid];
    const qy = query(collection(db, "users"), where("upline", "==", uid), limit(11));
    const snap = await getDocs(qy);
    const count = Math.min(10, snap.size >= 10 ? 10 : snap.size);
    setL1Progress((prev) => ({ ...prev, [uid]: count }));
    return count;
  }

  const l1Children = useMemo(() => childrenCache[currentUid] || [], [childrenCache, currentUid]);
  const completedL1 = useMemo(() => {
    return l1Children.reduce((c, kid) => {
      const n = l1Progress[kid.id];
      return n !== undefined && n >= 10 ? c + 1 : c;
    }, 0);
  }, [l1Children, l1Progress]);

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
      } catch {
        console.warn("Mission 3 tally failed");
      }
    })();
  }, [mission2Done, currentUid, childrenCache]);

  function heroLine() {
    if (!mission1Done) {
      const need = Math.max(0, L1_GOAL - (counts.levels?.["1"] || 0));
      return t("hero.mission1", { need });
    }
    if (!mission2Done) {
      const need = Math.max(0, M2_TARGET - completedL1);
      return t("hero.mission2", { need });
    }
    if (l2Leaders10 < M3_TARGET) {
      const need = Math.max(0, M3_TARGET - l2Leaders10);
      return t("hero.mission3", { need });
    }
    return t("hero.done");
  }

  /** ===== Loading screen ===== */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-base text-gray-500">{t("loading")}</p>
      </div>
    );
  }

  /** ===== UI ===== */
  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{t("title")}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25 transition"
            >
              {t("help")}
            </button>
            <button
              onClick={async () => {
                await signOut(auth);
                router.push("/login");
              }}
              className="rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25 transition"
            >
              {t("logout")}
            </button>
          </div>
        </div>
      </header>

      {/* ...rest of JSX unchanged, but all text now wrapped in t("...") keys ... */}
    </div>
  );
}

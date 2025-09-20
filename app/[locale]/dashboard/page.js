"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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
  limit,
} from "firebase/firestore";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";

/** ===== Constants ===== */
const MAX_DEPTH = 6;
const L1_GOAL = 10;
const M2_TARGET = 3;
const M3_TARGET = 3;

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
  const [expanded, setExpanded] = useState(new Set());

  /** ===== Progress caches ===== */
  const [l1Progress, setL1Progress] = useState({});
  const [l2Leaders10, setL2Leaders10] = useState(0);

  /** ===== UI toggles ===== */
  const [showHelp, setShowHelp] = useState(false);

  /** ===== Clipboard / QR ===== */
  const [copySuccess, setCopySuccess] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrSize, setQrSize] = useState(120);
  const qrBoxRef = useRef(null);

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
        await expandToLevel(1); // now defined below
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

  /** ===== Expand helper (stub) ===== */
  async function expandToLevel(level) {
    console.log("Expand to level", level);
    setExpanded(new Set([level]));
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

  useEffect(() => {
    const link = referralLink();
    if (!link) return;
    QRCode.toDataURL(link, { width: qrSize, margin: 0, errorCorrectionLevel: "M" })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(""));
  }, [qrSize, userData?.referralId]);

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
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
            {t("title")}
          </h1>
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
              {t("actions.logout")}
            </button>
          </div>
        </div>
      </header>

      {/* Example content */}
      <main className="mx-auto max-w-4xl p-4">
        <p>{t("welcome")}</p>
        <div ref={qrBoxRef} className="mt-4 flex justify-center">
          {qrDataUrl && (
            <Image src={qrDataUrl} alt="QR Code" width={qrSize} height={qrSize} />
          )}
        </div>
      </main>
    </div>
  );
}

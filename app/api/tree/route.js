// app/api/tree/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminDb } from "firebase-admin/firestore";
import { ensureAdminApp } from "@/lib/firebaseAdmin";

/**
 * GET /api/tree?uid=<optional>&depth=6
 * Returns descendants up to `depth` levels (default 6).
 * Security: caller must be self or an ancestor of target uid.
 *
 * Response:
 * {
 *   rootUid: string,
 *   depth: number,
 *   total: number,             // total count across all levels
 *   levels: [                  // 0 = directs (level 1)
 *     { level: 1, users: [{ id, name, email, referralId, createdAt, uid }] },
 *     ...
 *   ]
 * }
 */
export async function GET(req) {
  await ensureAdminApp();

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(token);
    const requesterUid = decoded.uid;
    const db = getAdminDb();

    const url = new URL(req.url);
    const targetUid = url.searchParams.get("uid") || requesterUid;
    let depth = parseInt(url.searchParams.get("depth") || "6", 10);
    if (isNaN(depth) || depth < 1) depth = 1;
    if (depth > 6) depth = 6; // hard cap

    // Security: only allow viewing your own tree
    if (targetUid !== requesterUid) {
      const ok = await isAncestor(db, requesterUid, targetUid);
      if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { levels, total } = await fetchTreeLevels(db, targetUid, depth);
    return NextResponse.json({ rootUid: targetUid, depth, total, levels });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

// ---- helpers ----

async function isAncestor(db, ancestorUid, targetUid) {
  // walk up via upline pointers
  let cursor = targetUid;
  let hops = 0;
  while (cursor && hops < 100) {
    if (cursor === ancestorUid) return true;
    const snap = await db.collection("users").doc(cursor).get();
    if (!snap.exists) break;
    const data = snap.data() || {};
    cursor = data.upline || null;
    if (cursor === ancestorUid) return true;
    hops++;
  }
  return ancestorUid === targetUid;
}

async function fetchTreeLevels(db, rootUid, depth) {
  const levels = [];
  let frontier = [rootUid];
  let total = 0;
  const BATCH = 30; // Firestore 'in' max

  for (let lvl = 1; lvl <= depth; lvl++) {
    const next = [];
    let levelUsers = [];

    // chunked 'in' queries on upline
    for (let i = 0; i < frontier.length; i += BATCH) {
      const slice = frontier.slice(i, i + BATCH);
      if (slice.length === 0) continue;
      const snap = await db.collection("users").where("upline", "in", slice).get();
      for (const d of snap.docs) {
        const data = d.data() || {};
        levelUsers.push({
          id: d.id,
          uid: data.uid || d.id,
          name: data.name || "",
          email: data.email || "",
          referralId: data.referralId || "",
          createdAt: data.createdAt?._seconds
            ? new Date(data.createdAt._seconds * 1000).toISOString()
            : "",
        });
        next.push(d.id);
      }
    }

    levels.push({ level: lvl, users: levelUsers });
    total += levelUsers.length;
    frontier = next;

    if (next.length === 0) break; // no deeper levels
  }

  return { levels, total };
}

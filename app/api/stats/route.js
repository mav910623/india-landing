// app/api/stats/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminDb } from "firebase-admin/firestore";
import { ensureAdminApp } from "@/lib/firebaseAdmin";

/**
 * Returns { totalDownlines: number }
 * Strategy:
 * 1) Try counting via `upline` chain (fast & scalable).
 * 2) If that yields 0 (or looks empty), fall back to counting via `referrals` arrays
 *    which matches your current data model from the old dashboard.
 */
export async function GET(req) {
  await ensureAdminApp();

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const rootUid = decoded.uid;
    const db = getAdminDb();

    // First attempt: count using `upline` (BFS)
    const viaUpline = await countByUpline(db, rootUid);

    // If we got a sensible number, use it. If it's 0, fall back to referrals.
    if (viaUpline > 0) {
      return NextResponse.json({ totalDownlines: viaUpline });
    }

    // Fallback: count using `referrals` chains starting from the root user doc
    const viaReferrals = await countByReferrals(db, rootUid);
    return NextResponse.json({ totalDownlines: viaReferrals });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Auth error" }, { status: 401 });
  }
}

// --------- Helpers ---------

async function countByUpline(db, rootUid) {
  let count = 0;
  let frontier = [rootUid];
  const batchSize = 30; // Firestore supports up to 30 in 'in' queries

  // BFS over upline graph
  while (frontier.length) {
    const next = [];
    for (let i = 0; i < frontier.length; i += batchSize) {
      const slice = frontier.slice(i, i + batchSize);
      const snap = await db.collection("users").where("upline", "in", slice).get();
      const children = snap.docs.map((d) => d.id);
      count += children.length;
      next.push(...children);
    }
    frontier = next;
  }
  return count;
}

async function countByReferrals(db, rootUid) {
  // We’ll traverse by reading the root user’s referrals array,
  // then each child’s referrals array, etc.
  // Note: 'in' operator supports up to 30 values; we’ll do it in chunks.
  const batchSize = 30;

  // Fetch the root doc first
  const rootSnap = await db.collection("users").doc(rootUid).get();
  if (!rootSnap.exists) return 0;

  const rootData = rootSnap.data() || {};
  let queue = Array.isArray(rootData.referrals) ? [...rootData.referrals] : [];
  let count = 0;

  while (queue.length) {
    // Take a chunk of UIDs
    const chunk = queue.splice(0, batchSize);

    // Load those users
    const snap = await db.collection("users").where("uid", "in", chunk).get();

    // For each user: count them + enqueue their referrals (if any)
    for (const doc of snap.docs) {
      count += 1; // this user is a descendant
      const d = doc.data() || {};
      const nextRefs = Array.isArray(d.referrals) ? d.referrals : [];
      if (nextRefs.length) {
        queue.push(...nextRefs);
      }
    }
  }

  return count;
}

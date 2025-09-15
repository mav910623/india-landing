// app/api/level-counts/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminDb } from "firebase-admin/firestore";
import { ensureAdminApp } from "@/lib/firebaseAdmin";

/**
 * Returns exact per-level counts + total + 6+
 * Example: { levels: {1: 12, 2: 40,...}, sixPlus: 3, total: 55 }
 */
export async function GET(req) {
  await ensureAdminApp();

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(token);
    const rootUid = decoded.uid;
    const db = getAdminDb();

    const { perLevel, sixPlus, total } = await computePerLevelCounts(db, rootUid);

    return NextResponse.json({ levels: perLevel, sixPlus, total });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

// --- BFS with count() aggregation instead of doc reads ---
async function computePerLevelCounts(db, rootUid) {
  const perLevel = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
  let sixPlus = 0;
  let total = 0;

  const BATCH = 30; // Firestore "in" limit
  let currentLevel = 1;
  let frontier = [rootUid];

  while (frontier.length) {
    let nextFrontier = [];
    let levelCount = 0;

    for (let i = 0; i < frontier.length; i += BATCH) {
      const slice = frontier.slice(i, i + BATCH);
      const q = db.collection("users").where("upline", "in", slice);
      const agg = await q.count().get(); // aggregation query
      levelCount += agg.data().count;

      const snap = await q.get();
      nextFrontier.push(...snap.docs.map((d) => d.id));
    }

    if (!levelCount) break;
    total += levelCount;

    if (currentLevel <= 6) perLevel[String(currentLevel)] = levelCount;
    else sixPlus += levelCount;

    frontier = nextFrontier;
    currentLevel++;
  }

  return { perLevel, sixPlus, total };
}

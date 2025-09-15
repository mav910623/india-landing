// app/api/level-counts/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { adminAuth, adminDb, ensureAdminApp } from "@/lib/firebaseAdmin";

/**
 * GET /api/level-counts
 * Returns exact per-level counts (1..6), 6+ overflow, and total.
 * Shape:
 * {
 *   levels: { "1": number, "2": number, "3": number, "4": number, "5": number, "6": number },
 *   sixPlus: number,
 *   total: number
 * }
 */
export async function GET(req) {
  try {
    // Ensure firebase-admin is initialized (reads GOOGLE_APPLICATION_CREDENTIALS_JSON)
    ensureAdminApp();

    // Verify caller
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const decoded = await adminAuth().verifyIdToken(token);
    const rootUid = decoded.uid;

    const { perLevel, sixPlus, total } = await computePerLevelCounts(adminDb(), rootUid);
    return NextResponse.json({ levels: perLevel, sixPlus, total });
  } catch (e) {
    console.error("level-counts error:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/**
 * Compute counts by breadth-first traversal using Firestore aggregation count()
 * and batched "in" queries (max 30 parents per batch).
 */
async function computePerLevelCounts(db, rootUid) {
  // Keep keys as strings to be consistent on the client
  const perLevel = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
  let sixPlus = 0;
  let total = 0;

  const BATCH = 30; // Firestore "in" operator limit
  let currentLevel = 1;
  let frontier = [rootUid]; // start from the user

  while (frontier.length) {
    let nextFrontier = [];
    let levelCount = 0;

    // Query children for up to 30 parents per batch
    for (let i = 0; i < frontier.length; i += BATCH) {
      const parents = frontier.slice(i, i + BATCH);
      const q = db.collection("users").where("upline", "in", parents);

      // Fast aggregation count (no doc payloads)
      const aggSnap = await q.count().get();
      levelCount += aggSnap.data().count;

      // We still need the child IDs to form the next frontier
      const snap = await q.get();
      for (const doc of snap.docs) {
        nextFrontier.push(doc.id);
      }
    }

    if (!levelCount) break; // no more levels

    total += levelCount;
    if (currentLevel <= 6) {
      perLevel[String(currentLevel)] = levelCount;
    } else {
      sixPlus += levelCount;
    }

    frontier = nextFrontier;
    currentLevel++;
  }

  return { perLevel, sixPlus, total };
}

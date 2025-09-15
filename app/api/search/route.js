// app/api/search/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminDb } from "firebase-admin/firestore";
import { ensureAdminApp } from "@/lib/firebaseAdmin";

/**
 * GET /api/search?q=term
 * Looks up users by exact referralId / exact email / prefix name.
 * Returns minimal user + ancestor path to root.
 */
export async function GET(req) {
  await ensureAdminApp();

  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    if (!q) return NextResponse.json({ results: [] });

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const decoded = await getAdminAuth().verifyIdToken(token);
    const rootUid = decoded.uid;
    const db = getAdminDb();

    const results = [];
    const seen = new Set();

    // By referralId
    let snap = await db.collection("users").where("referralId", "==", q.toUpperCase()).get();
    snap.forEach((d) => {
      results.push({ id: d.id, ...d.data() });
      seen.add(d.id);
    });

    // By email
    snap = await db.collection("users").where("email", "==", q).get();
    snap.forEach((d) => {
      if (!seen.has(d.id)) {
        results.push({ id: d.id, ...d.data() });
        seen.add(d.id);
      }
    });

    // By name prefix (store lowercase `nameLC` at registration!)
    snap = await db.collection("users")
      .orderBy("nameLC")
      .startAt(q)
      .endAt(q + "\uf8ff")
      .limit(20)
      .get();
    snap.forEach((d) => {
      if (!seen.has(d.id)) {
        results.push({ id: d.id, ...d.data() });
        seen.add(d.id);
      }
    });

    // For each result, climb ancestors up to root
    const withPaths = [];
    for (const r of results) {
      const path = [];
      let cur = r;
      let hops = 0;
      while (cur && cur.upline && hops < 20) {
        const upSnap = await db.collection("users").doc(cur.upline).get();
        if (!upSnap.exists) break;
        const up = { id: upSnap.id, ...upSnap.data() };
        path.unshift(up.id);
        cur = up;
        hops++;
        if (up.id === rootUid) break;
      }
      withPaths.push({ user: r, path });
    }

    return NextResponse.json({ results: withPaths });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

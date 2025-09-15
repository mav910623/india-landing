// lib/firebaseAdmin.js
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app;

/** Initialize firebase-admin once using GOOGLE_APPLICATION_CREDENTIALS_JSON */
export function ensureAdminApp() {
  if (app) return app;

  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) {
    throw new Error(
      "Missing GOOGLE_APPLICATION_CREDENTIALS_JSON env var (set in Vercel → Project → Settings → Environment Variables)."
    );
  }

  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON.");
  }

  const projectId =
    sa.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT;

  if (!projectId) {
    throw new Error("No projectId found in service account JSON or env.");
  }

  app = initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key?.replace(/\\n/g, "\n"),
    }),
    projectId,
  });

  return app;
}

export function adminAuth() {
  ensureAdminApp();
  return getAuth();
}

export function adminDb() {
  ensureAdminApp();
  return getFirestore();
}

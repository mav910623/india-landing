import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";

export function ensureAdminApp() {
  if (getApps().length > 0) return;
  const pk = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (pk && process.env.FIREBASE_CLIENT_EMAIL && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: pk,
      }),
    });
  } else {
    initializeApp({ credential: applicationDefault() });
  }
}

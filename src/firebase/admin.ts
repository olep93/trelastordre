import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function serviceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64;
  const raw = encoded
    ? Buffer.from(encoded, "base64").toString("utf8")
    : process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!raw) {
    throw new Error("Firebase Admin er ikke konfigurert på serveren.");
  }

  const value = JSON.parse(raw);
  if (value.private_key) value.private_key = value.private_key.replace(/\\n/g, "\n");
  return value;
}

function adminApp() {
  return getApps()[0] || initializeApp({
    credential: cert(serviceAccount()),
    projectId: "trelastordre",
  });
}

export function getAdminAuth() {
  return getAuth(adminApp());
}

export function getAdminDb() {
  return getFirestore(adminApp());
}

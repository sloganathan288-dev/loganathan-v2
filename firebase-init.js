// ── Firebase initialization ───────────────────────────────────
// Loaded as an ES module. No build step / bundler required — the browser
// fetches these directly from Google's CDN.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  getBytes,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

import { FIREBASE_CONFIG, FUNCTIONS_REGION } from "./config.js";

export const firebaseApp = initializeApp(FIREBASE_CONFIG);

export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const functions = getFunctions(firebaseApp, FUNCTIONS_REGION);

// During local development, use the free Firebase emulators instead of
// production Cloud Functions/Storage. The deployed site uses the real services.
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

if (isLocal) {
  connectFirestoreEmulator(db, "127.0.0.1", 8081);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
// Re-export the Firestore/Storage/Auth helpers so app.js has one import source
export {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  connectFirestoreEmulator,
  fbSignOut,
  onAuthStateChanged,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  getBytes,
  connectFunctionsEmulator,
  connectStorageEmulator,
  httpsCallable,
};

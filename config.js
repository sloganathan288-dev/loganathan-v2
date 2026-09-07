// ── Loganathan config ─────────────────────────────────────────
// These Firebase values are PUBLIC by design — Firebase's security comes
// from Firestore/Storage rules, not from hiding this file. It is normal
// and safe for this to be visible in your GitHub repo.
//
// Get these values from: Firebase Console → Project Settings → General
// → "Your apps" → Web app → SDK setup and configuration.
//
// The Anthropic key does NOT go anywhere in this project's frontend files.
// It lives only in the Cloud Function's secret (see functions/README section
// in the main README.md).

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAOSg0JsbiBT6RMlLHjOSZLTG4DslZhnjE",
  authDomain: "loganathan-v2.firebaseapp.com",
  projectId: "loganathan-v2",
  storageBucket: "loganathan-v2.firebasestorage.app",
  messagingSenderId: "244368200551",
  appId: "1:244368200551:web:4a7a409183af2cb683d5c2",
  measurementId: "G-FNMQ7HB7RD"
};

// Region your Cloud Function is deployed to. "us-central1" is the default
// unless you changed it when deploying.
export const FUNCTIONS_REGION = "us-central1";

// App-wide constants
export const APP_NAME = "AIXLEAON";
export const MAX_IMAGE_MB = 5;
export const MAX_FILE_MB = 10;
export const CONTEXT_RECENT_MESSAGES = 12; // how many recent messages get sent in full to the AI

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

export const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Region your Cloud Function is deployed to. "us-central1" is the default
// unless you changed it when deploying.
export const FUNCTIONS_REGION = "us-central1";

// App-wide constants
export const APP_NAME = "Loganathan";
export const MAX_IMAGE_MB = 5;
export const MAX_FILE_MB = 10;
export const CONTEXT_RECENT_MESSAGES = 12; // how many recent messages get sent in full to the AI

// ── AIXLEAON config ───────────────────────────────────────────
// Firebase web configuration is public by design.
// NEVER put the Anthropic API key in this file.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAOSg0JsbiBT6RMlLHjOSZLTG4DslZhnjE",
  authDomain: "loganathan-v2.firebaseapp.com",
  projectId: "loganathan-v2",
  storageBucket: "loganathan-v2.firebasestorage.app",
  messagingSenderId: "244368200551",
  appId: "1:244368200551:web:4a7a409183af2cb683d5c2",
  measurementId: "G-FNMQ7HB7RD"
};

// Cloud Functions region
export const FUNCTIONS_REGION = "us-central1";

// App-wide constants
export const APP_NAME = "AIXLEAON";
export const MAX_IMAGE_MB = 5;
export const MAX_FILE_MB = 10;
export const CONTEXT_RECENT_MESSAGES = 12;
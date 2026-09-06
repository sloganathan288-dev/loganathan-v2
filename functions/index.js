// ── Loganathan secure AI backend ──────────────────────────────
// This is the ONLY place the real Anthropic API key exists. It is stored as
// a Firebase secret (see README.md → "Configure the Anthropic secret") and
// is never sent to, or readable from, the browser.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Keep this in one place so switching models/providers later is a one-line change.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const MAX_MESSAGES = 30;          // hard ceiling regardless of what the client sends
const MAX_TOTAL_CHARS = 60000;    // rough guard against oversized requests burning tokens

function toAnthropicContent(content) {
  // content is either a plain string, or an array of {type:'text'|'image', ...} parts
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  return content.map((part) => {
    if (part.type === "image") {
      return { type: "image", source: { type: "base64", media_type: part.mediaType || "image/jpeg", data: part.data } };
    }
    return { type: "text", text: String(part.text ?? "") };
  });
}

exports.chatWithLoganathan = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", timeoutSeconds: 60, cors: true },
  async (request) => {
    // 1. Require a signed-in Firebase user — this is the entire security boundary for this function.
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const { systemPrompt, messages } = request.data || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError("invalid-argument", "No messages provided.");
    }

    // 2. Basic abuse/cost guards — independent of whatever the frontend already trims.
    const trimmed = messages.slice(-MAX_MESSAGES);
    let totalChars = (systemPrompt || "").length;
    for (const m of trimmed) {
      totalChars += typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length;
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      throw new HttpsError("invalid-argument", "That request is too large. Try a shorter message or fewer attachments.");
    }

    const anthropicMessages = trimmed
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: toAnthropicContent(m.content) }));

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt || "",
          messages: anthropicMessages,
        }),
      });

      if (res.status === 429) {
        throw new HttpsError("resource-exhausted", "AI usage is temporarily limited. Please try again shortly.");
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error("Anthropic API error", res.status, errBody);
        throw new HttpsError("internal", "The AI provider returned an error.");
      }

      const data = await res.json();
      const textBlock = (data.content || []).find((b) => b.type === "text");
      return { reply: textBlock ? textBlock.text : "(no reply)" };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("chatWithLoganathan failed", err);
      throw new HttpsError("internal", "Unable to reach the AI provider right now.");
    }
  }
);

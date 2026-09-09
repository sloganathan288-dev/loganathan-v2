// AIXLEAON secure AI backend — Gemini
// The Gemini API key is kept server-side in a Firebase secret.
// It must never be placed in config.js, app.js, or GitHub.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Gemini 2.5 Flash-Lite currently has a free tier and is a good fit for chat.
const MODEL = "gemini-3.5-flash-lite";
const MAX_TOKENS = 1024;
const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 60000;

function toGeminiParts(content) {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  if (!Array.isArray(content)) {
    return [{ text: String(content ?? "") }];
  }

  return content.map((part) => {
    if (part.type === "image") {
      return {
        inlineData: {
          mimeType: part.mediaType || "image/jpeg",
          data: part.data,
        },
      };
    }

    return { text: String(part.text ?? "") };
  });
}

function toGeminiContents(messages) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGeminiParts(m.content),
    }));
}

exports.chatWithLoganathan = onCall(
  {
    secrets: [GEMINI_API_KEY],
    region: "us-central1",
    timeoutSeconds: 60,
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const { systemPrompt, messages } = request.data || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new HttpsError("invalid-argument", "No messages provided.");
    }

    const trimmed = messages.slice(-MAX_MESSAGES);

    let totalChars = (systemPrompt || "").length;
    for (const message of trimmed) {
      totalChars += typeof message.content === "string"
        ? message.content.length
        : JSON.stringify(message.content).length;
    }

    if (totalChars > MAX_TOTAL_CHARS) {
      throw new HttpsError(
        "invalid-argument",
        "That request is too large. Try a shorter message or fewer attachments."
      );
    }

    const contents = toGeminiContents(trimmed);

    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent` +
        `?key=${encodeURIComponent(GEMINI_API_KEY.value())}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: systemPrompt
            ? { parts: [{ text: systemPrompt }] }
            : undefined,
          contents,
          generationConfig: {
            maxOutputTokens: MAX_TOKENS,
            temperature: 0.7,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        console.error("Gemini rate limit", data);
        throw new HttpsError(
          "resource-exhausted",
          "Gemini's free usage limit was reached temporarily. Please try again later."
        );
      }

      if (!res.ok) {
        console.error("Gemini API error", res.status, data);
        throw new HttpsError(
          "internal",
          "The AI provider returned an error. Please try again."
        );
      }

      const reply = (data.candidates || [])
        .flatMap((candidate) => candidate.content?.parts || [])
        .map((part) => part.text || "")
        .join("")
        .trim();

      return { reply: reply || "(no reply)" };
    } catch (err) {
      if (err instanceof HttpsError) throw err;

      console.error("chatWithLoganathan failed", err);
      throw new HttpsError(
        "internal",
        "Unable to reach the AI provider right now."
      );
    }
  }
);

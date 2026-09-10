const ALLOWED_ORIGINS = new Set([
  "https://sloganathan288-dev.github.io",
  "https://loganathan-v2.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const GEMINI_MODEL = "gemini-3.5-flash-lite";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin":
      ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function sendJson(res, data, status, origin) {
  res
    .status(status)
    .setHeader("Access-Control-Allow-Origin",
      ALLOWED_ORIGINS.has(origin) ? origin : "null")
    .setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type")
    .setHeader("Content-Type", "application/json")
    .setHeader("Vary", "Origin")
    .json(data);
}

function convertContent(content) {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .map((part) => {
      if (part?.type === "text") {
        return {
          text: String(part.text || ""),
        };
      }

      if (part?.type === "image" && part.data) {
        return {
          inlineData: {
            mimeType: part.mediaType || "image/jpeg",
            data: part.data,
          },
        };
      }

      return null;
    })
    .filter(Boolean);
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";

  if (req.method === "OPTIONS") {
    res.status(204)
      .setHeader("Access-Control-Allow-Origin",
        ALLOWED_ORIGINS.has(origin) ? origin : "null")
      .setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
      .setHeader("Access-Control-Allow-Headers", "Content-Type")
      .setHeader("Vary", "Origin")
      .end();

    return;
  }

  if (!ALLOWED_ORIGINS.has(origin)) {
    return sendJson(
      res,
      { error: "Origin not allowed." },
      403,
      origin
    );
  }

  if (req.method !== "POST") {
    return sendJson(
      res,
      { error: "POST requests only." },
      405,
      origin
    );
  }

  try {
    const body = req.body || {};

    const systemPrompt =
      typeof body.systemPrompt === "string"
        ? body.systemPrompt
        : "";

    const messages =
      Array.isArray(body.messages)
        ? body.messages
        : [];

    if (!messages.length) {
      return sendJson(
        res,
        { error: "No messages supplied." },
        400,
        origin
      );
    }

    const contents = messages
      .map((message) => {
        const role =
          message.role === "assistant"
            ? "model"
            : "user";

        return {
          role,
          parts: convertContent(message.content),
        };
      })
      .filter(
        (message) => message.parts.length > 0
      );

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
        process.env.GEMINI_API_KEY
      )}`;

    const geminiResponse = await fetch(
      geminiUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  systemPrompt ||
                  "You are Loganathan, a helpful personal AI assistant.",
              },
            ],
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    const geminiData =
      await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error(
        "Gemini API error:",
        JSON.stringify(geminiData)
      );

      return sendJson(
        res,
        {
          error:
            geminiData?.error?.message ||
            `Gemini API returned HTTP ${geminiResponse.status}.`,
        },
        502,
        origin
      );
    }

    const reply =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") ||
      "(No response from Gemini.)";

    return sendJson(
      res,
      { reply },
      200,
      origin
    );
  } catch (error) {
    console.error("Vercel API error:", error);

    return sendJson(
      res,
      {
        error:
          "The AI request could not be completed.",
      },
      500,
      origin
    );
  }
}
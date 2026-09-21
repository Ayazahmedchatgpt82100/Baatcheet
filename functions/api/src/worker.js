const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;
const SYSTEM =
  "You are a helpful, concise assistant for developers. Reply in the same language and script the user writes in (for example Hinglish in Roman script). Put code in markdown code fences.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      return chat(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function chat(request, env) {
  if (!env.GEMINI_API_KEY) return json({ error: "Server is not configured" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, MAX_CHARS) }],
    }));

  while (messages.length && messages[0].role === "model") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "No message to answer" }, 400);
  }

  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: messages,
      generationConfig: { maxOutputTokens: 1000 },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: data?.error?.message || `Model error (${res.status})` }, 502);

  const reply = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!reply) return json({ error: "The model returned an empty reply" }, 502);
  return json({ reply });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
      }

// One Gemini call with the visitor's own key. The key goes in a header, not the URL, and is never stored or logged.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

export class GeminiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validGeminiKey(key) { return /^[\x21-\x7e]{8,300}$/.test(String(key || "")); }

/** Returns the reply text, or throws GeminiError with a message that is safe to show. */
export async function geminiText(key, model, prompt) {
  const response = await fetch(`${BASE}${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const body = await response.text();
  if (response.status === 401 || response.status === 403 || (response.status === 400 && /api[ _]?key/i.test(body))) {
    throw new GeminiError(401, "Google rejected that Gemini API key. Check it and try again.");
  }
  if (response.status === 429) throw new GeminiError(429, "Your Gemini key hit its rate limit. Wait a minute and try again.");
  if (!response.ok) throw new GeminiError(502, `Gemini could not answer (error ${response.status}). Try again.`);
  try { return JSON.parse(body).candidates[0].content.parts[0].text; }
  catch { throw new GeminiError(502, "Gemini returned an empty reply. Try again."); }
}

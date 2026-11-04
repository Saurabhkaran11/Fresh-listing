import assert from "node:assert/strict";
import test from "node:test";
import { geminiText, validGeminiKey } from "../lib/gemini.mjs";

function stubFetch(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(body, { status }); };
  return calls;
}

test("the key goes in a header to Google and never in the URL", async () => {
  const calls = stubFetch(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
  assert.equal(await geminiText("fake-key-12345", "m", "hi"), "ok");
  assert.ok(calls[0].url.startsWith("https://generativelanguage.googleapis.com/"));
  assert.ok(!calls[0].url.includes("fake-key-12345"));
  assert.equal(calls[0].init.headers["x-goog-api-key"], "fake-key-12345");
});

test("a rejected key gets a clear message that does not echo the provider body", async () => {
  stubFetch(400, JSON.stringify({ error: { message: "API key not valid fake-key-12345" } }));
  await assert.rejects(geminiText("fake-key-12345", "m", "hi"), (e) => e.status === 401 && /rejected/.test(e.message) && !e.message.includes("fake-key"));
});

test("rate limits are explained", async () => {
  stubFetch(429, "{}");
  await assert.rejects(geminiText("fake-key-12345", "m", "hi"), (e) => e.status === 429);
});

test("key shape check blocks empty keys and header injection", () => {
  assert.equal(validGeminiKey(""), false);
  assert.equal(validGeminiKey("abc\r\ndef-12345"), false);
  assert.equal(validGeminiKey("AIza-looks-fine"), true);
});

import { runtimeEnv } from "./runtime-db";

function encode(value: string) {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value: string) {
  return atob(value.replaceAll("-", "+").replaceAll("_", "/"));
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encode(String.fromCharCode(...new Uint8Array(signature)));
}

export async function createRealtimeToken(userId: string, email: string) {
  const secret = String(runtimeEnv().REALTIME_SESSION_SECRET || "");
  if (!secret) return null;
  const header = encode(JSON.stringify({ alg: "HS256", typ: "FL" }));
  const payload = encode(JSON.stringify({ sub: userId, email, exp: Math.floor(Date.now() / 1000) + 900 }));
  const body = `${header}.${payload}`;
  return `${body}.${await sign(body, secret)}`;
}

export function decodeRealtimePayload(token: string) {
  const [, payload] = token.split(".");
  return payload ? JSON.parse(decode(payload)) as { sub: string; email: string; exp: number } : null;
}

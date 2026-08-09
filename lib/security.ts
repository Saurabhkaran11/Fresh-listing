import { randomBytes } from "node:crypto";

/** Generate an opaque value for account-link and webhook state transitions. */
export function secureToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function clampText(value: unknown, max: number): string {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

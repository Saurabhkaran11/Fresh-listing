/** Generate an opaque value for account-link and webhook state transitions. */
export function secureToken(bytes = 24): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return btoa(String.fromCharCode(...values)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
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

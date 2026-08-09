import { runtimeEnv } from "./runtime-db";

export type RealtimeEvent = "scrape:started" | "scrape:progress" | "job:saved" | "digest:ready";

/**
 * The UI can run on Sites while Socket.IO runs on a separate Node service.
 * This tiny authenticated bridge keeps the two runtimes decoupled and lets
 * the app degrade cleanly when the optional realtime service is offline.
 */
export async function emitRealtimeEvent(event: RealtimeEvent, payload: Record<string, unknown>) {
  const config = runtimeEnv();
  const serviceUrl = String(config.REALTIME_SERVICE_URL || "").replace(/\/$/, "");
  const secret = String(config.REALTIME_EVENT_SECRET || "");
  if (!serviceUrl || !secret) return false;

  try {
    const response = await fetch(`${serviceUrl}/internal/events`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ event, payload }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

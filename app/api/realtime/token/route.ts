import { getSessionUser } from "@/lib/session-user";
import { runtimeEnv } from "../../../../lib/runtime-db";
import { createRealtimeToken } from "../../../../lib/realtime-token";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in to start realtime updates." }, { status: 401 });
  const token = await createRealtimeToken(user.userId, user.email);
  const serviceUrl = String(runtimeEnv().REALTIME_SERVICE_URL || "").replace(/\/$/, "");
  if (!token || !serviceUrl) return Response.json({ configured: false }, { headers: { "cache-control": "no-store" } });
  return Response.json({ configured: true, url: serviceUrl, token }, { headers: { "cache-control": "no-store" } });
}

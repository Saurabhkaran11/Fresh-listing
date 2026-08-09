import { getSessionUser, sessionSignInPath } from "@/lib/session-user";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ authenticated: false, signInPath: sessionSignInPath("/") }, { headers: { "cache-control": "no-store" } });
  return Response.json({ authenticated: true, user }, { headers: { "cache-control": "no-store" } });
}

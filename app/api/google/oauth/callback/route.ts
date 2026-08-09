import { encryptToken, googleConfig } from "../../../../../lib/google";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { databaseErrorMessage, getD1, requestOrigin } from "../../../../../lib/runtime-db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origin = requestOrigin(request);
  if (error) return Response.redirect(`${origin}/?google=cancelled`);
  if (!code || !state) return Response.redirect(`${origin}/?google=missing`);
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.redirect(`${origin}/?google=signin-required`);
    const database = getD1();
    const savedState = await database.prepare("SELECT owner_user_id, expires_at FROM oauth_states WHERE state = ?").bind(state).first<{ owner_user_id: string; expires_at: number }>();
    if (!savedState || savedState.owner_user_id !== user.userId || savedState.expires_at < Date.now()) return Response.redirect(`${origin}/?google=invalid-state`);
    await database.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
    const config = googleConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: `${origin}/api/google/oauth/callback`, grant_type: "authorization_code" }) });
    const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error || "Google did not return an access token.");
    const previous = await database.prepare("SELECT google_refresh_token FROM user_settings WHERE owner_user_id = ?").bind(user.userId).first<{ google_refresh_token: string | null }>();
    const refreshToken = tokens.refresh_token ? await encryptToken(tokens.refresh_token) : previous?.google_refresh_token;
    if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect and approve offline access.");
    await database.prepare("UPDATE user_settings SET google_refresh_token = ?, google_access_token = ?, google_access_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?").bind(refreshToken, await encryptToken(tokens.access_token), Date.now() + (tokens.expires_in || 3600) * 1000, user.userId).run();
    return Response.redirect(`${origin}/?google=connected`);
  } catch (caught) { return Response.redirect(`${origin}/?google=error&message=${encodeURIComponent(databaseErrorMessage(caught))}`); }
}

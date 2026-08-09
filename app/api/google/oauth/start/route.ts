import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureUserSettings, getD1, requestOrigin } from "../../../../../lib/runtime-db";
import { oauthUrl } from "../../../../../lib/google";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in with ChatGPT before connecting Google Drive." }, { status: 401 });
  try {
    const database = getD1();
    await ensureUserSettings(database, user.userId, user.email);
    const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await database.prepare("INSERT INTO oauth_states (state, owner_user_id, expires_at) VALUES (?, ?, ?)").bind(state, user.userId, Date.now() + 10 * 60 * 1000).run();
    return Response.redirect(oauthUrl(requestOrigin(request), state), 302);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Google OAuth is not configured." }, { status: 503 }); }
}

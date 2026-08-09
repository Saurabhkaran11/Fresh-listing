import { chatGPTSignInPath, getChatGPTUser } from "../../../chatgpt-auth";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ authenticated: false, signInPath: chatGPTSignInPath("/") }, { headers: { "cache-control": "no-store" } });
  return Response.json({ authenticated: true, user }, { headers: { "cache-control": "no-store" } });
}

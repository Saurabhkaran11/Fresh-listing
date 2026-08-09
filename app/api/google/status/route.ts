import { getSessionUser } from "@/lib/session-user";
import { databaseErrorMessage, ensureUserSettings, getDatabase, runtimeEnv } from "../../../../lib/runtime-db";
import { getSettings } from "../../../../lib/google";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ connected: false, error: "Sign in to continue to connect Google Drive." }, { status: 401 });
  try {
    const database = getDatabase();
    await ensureUserSettings(database, user.userId, user.email);
    const settings = await getSettings(database, user.userId);
    const config = runtimeEnv();
    return Response.json({ connected: Boolean(settings.google_refresh_token), googleAccountEmail: settings.google_account_email, spreadsheetUrl: settings.spreadsheet_id ? `https://docs.google.com/spreadsheets/d/${settings.spreadsheet_id}/edit` : null, driveFolderUrl: settings.google_drive_folder_id ? `https://drive.google.com/drive/folders/${settings.google_drive_folder_id}` : null, googleConfigured: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_TOKEN_ENCRYPTION_KEY), providerConfigured: Boolean(config.SERPAPI_API_KEY), emailConfigured: Boolean(config.RESEND_API_KEY && config.EMAIL_FROM) });
  } catch (error) { return Response.json({ connected: false, error: databaseErrorMessage(error) }, { status: 500 }); }
}

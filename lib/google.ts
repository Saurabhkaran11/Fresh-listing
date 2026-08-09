import { runtimeEnv } from "./runtime-db";
import type { Database } from "./runtime-db";

const SHEET_HEADERS = ["Job title", "Company", "Source", "Location", "Posted", "Direct link", "Apply link", "Remote", "Experience", "Salary", "Fit score", "Skill gaps", "Captured at", "Search"];

type UserSettings = { google_account_email: string | null; google_drive_folder_id: string | null; spreadsheet_id: string | null; google_refresh_token: string | null; google_access_token: string | null; google_access_expires_at: number | null };

export function googleConfig() {
  const config = runtimeEnv();
  return { clientId: String(config.GOOGLE_CLIENT_ID || ""), clientSecret: String(config.GOOGLE_CLIENT_SECRET || ""), encryptionKey: String(config.GOOGLE_TOKEN_ENCRYPTION_KEY || "") };
}

export async function encryptToken(value: string) {
  const key = await cryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

export async function decryptToken(value: string) {
  const key = await cryptoKey();
  const [ivText, dataText] = value.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivText) }, key, fromBase64(dataText));
  return new TextDecoder().decode(plain);
}

export function oauthUrl(origin: string, state: string) {
  const config = googleConfig();
  if (!config.clientId || !config.clientSecret || !config.encryptionKey) throw new Error("Google OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_TOKEN_ENCRYPTION_KEY in Site settings.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${origin}/api/google/oauth/callback`, response_type: "code", access_type: "offline", prompt: "select_account consent", include_granted_scopes: "true", scope: "openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets", state }).toString();
  return url.toString();
}

export async function getSettings(database: Database, userId: string) {
  const result = await database.prepare("SELECT google_account_email, google_drive_folder_id, spreadsheet_id, google_refresh_token, google_access_token, google_access_expires_at FROM user_settings WHERE owner_user_id = ?").bind(userId).first<UserSettings>();
  return result || { google_account_email: null, google_drive_folder_id: null, spreadsheet_id: null, google_refresh_token: null, google_access_token: null, google_access_expires_at: null };
}

export async function getGoogleAccessToken(database: Database, userId: string) {
  const settings = await getSettings(database, userId);
  if (settings.google_access_token && settings.google_access_expires_at && settings.google_access_expires_at > Date.now() + 60_000) return decryptToken(settings.google_access_token);
  if (!settings.google_refresh_token) throw new Error("Connect Google Drive before syncing.");
  const refreshToken = await decryptToken(settings.google_refresh_token);
  const config = googleConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error || "Google access token refresh failed. Reconnect Google Drive.");
  await database.prepare("UPDATE user_settings SET google_access_token = ?, google_access_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?").bind(await encryptToken(payload.access_token), Date.now() + (payload.expires_in || 3600) * 1000, userId).run();
  return payload.access_token;
}

export async function syncJobsToSheet(database: Database, userId: string, jobs: Array<Record<string, unknown>>) {
  const accessToken = await getGoogleAccessToken(database, userId);
  const settings = await getSettings(database, userId);
  let folderId = settings.google_drive_folder_id;
  if (!folderId) {
    const folder = await googleRequest("https://www.googleapis.com/drive/v3/files", accessToken, { method: "POST", body: JSON.stringify({ name: "Fresh Listings", mimeType: "application/vnd.google-apps.folder" }) });
    folderId = String(folder.id || "");
    if (!folderId) throw new Error("Google Drive did not return a folder id.");
    await database.prepare("UPDATE user_settings SET google_drive_folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?").bind(folderId, userId).run();
  }
  let spreadsheetId = settings.spreadsheet_id;
  if (!spreadsheetId) {
    const created = await googleRequest("https://sheets.googleapis.com/v4/spreadsheets", accessToken, { method: "POST", body: JSON.stringify({ properties: { title: "Fresh Listings Job Tracker" } }) });
    spreadsheetId = String(created.spreadsheetId);
    await googleRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?addParents=${encodeURIComponent(folderId)}&removeParents=root`, accessToken, { method: "PATCH", body: JSON.stringify({}) });
    await database.prepare("UPDATE user_settings SET spreadsheet_id = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_user_id = ?").bind(spreadsheetId, userId).run();
  }
  await googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Sheet1!A1:N1")}?valueInputOption=RAW`, accessToken, { method: "PUT", body: JSON.stringify({ range: "Sheet1!A1:N1", majorDimension: "ROWS", values: [SHEET_HEADERS] }) });
  if (jobs.length) {
    const rows = jobs.map((job) => [job.title, job.company, job.source, job.location, job.posted_at, job.direct_url, job.apply_url, job.remote_status, job.experience, job.salary, job.fit_score, job.skill_gaps, job.captured_at, job.search_query]);
    await googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Sheet1!A:N")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, accessToken, { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: rows }) });
  }
  return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, saved: jobs.length };
}

async function googleRequest(url: string, accessToken: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init.headers || {}) } });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { /* preserve a useful status below */ }
  if (!response.ok) throw new Error(String(payload.error_description || (payload.error as { message?: string } | undefined)?.message || `Google API request failed with HTTP ${response.status}.`));
  return payload;
}

async function cryptoKey() {
  const value = googleConfig().encryptionKey;
  if (!value) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured.");
  const bytes = fromBase64(value);
  if (bytes.byteLength !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function base64(bytes: Uint8Array) { let value = ""; bytes.forEach((byte) => value += String.fromCharCode(byte)); return btoa(value); }
function fromBase64(value: string) { const binary = atob(value || ""); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }

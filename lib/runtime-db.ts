import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB?: D1Database;
  [key: string]: unknown;
};

export function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export function getD1(): D1Database {
  const database = runtimeEnv().DB;
  if (!database) throw new Error("The Fresh Listings database is not connected yet. Deploy with the DB binding enabled.");
  return database;
}

export async function ensureUserSettings(database: D1Database, userId: string, email: string) {
  await database.prepare(`
    INSERT INTO user_settings (owner_user_id, email)
    VALUES (?, ?)
    ON CONFLICT(owner_user_id) DO UPDATE SET email = excluded.email, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, email).run();
}

export function requestOrigin(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host") || new URL(request.url).host;
  return `${forwarded}://${host}`;
}

export function databaseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("no such table") || message.includes("D1 binding")) {
    return "The persistent database is not initialized yet. Deploy the latest Fresh Listings version with its DB binding, then try again.";
  }
  return message || "The database request failed.";
}

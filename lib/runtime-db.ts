import { neon } from "@neondatabase/serverless";
import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB?: D1Database;
  DATABASE_URL?: string;
  [key: string]: unknown;
};

/**
 * Runtime configuration works in both the current Cloudflare deployment and
 * the future Node/Vercel deployment. DATABASE_URL is the explicit Postgres
 * cutover switch; the Cloudflare binding remains the fallback when it is unset.
 */
export function runtimeEnv(): RuntimeEnv {
  const processEnv = typeof process !== "undefined" ? process.env : {};
  return { ...processEnv, ...(env as unknown as RuntimeEnv) } as RuntimeEnv;
}

/**
 * Database compatibility boundary.
 *
 * Existing routes use the D1 prepare/bind API. Keeping that small interface
 * here means we can switch to managed PostgreSQL by setting DATABASE_URL
 * without duplicating persistence logic across every API route. D1 remains the
 * safe rollback path until the PostgreSQL schema and data migration complete.
 */
export function getD1(): D1Database {
  const config = runtimeEnv();
  if (config.DATABASE_URL) return getPostgresDatabase(config.DATABASE_URL) as unknown as D1Database;
  if (!config.DB) throw new Error("The Fresh Listings database is not connected yet. Set DATABASE_URL or deploy with the DB binding enabled.");
  return config.DB;
}

export function databaseProvider(): "postgres" | "d1" {
  return runtimeEnv().DATABASE_URL ? "postgres" : "d1";
}

export async function ensureUserSettings(database: D1Database, userId: string, email: string) {
  if (databaseProvider() === "postgres") {
    // The production schema uses the authenticated subject as the stable user
    // primary key, so all owner_user_id foreign keys remain deterministic.
    await database.prepare(`
      INSERT INTO users (id, auth_subject, email)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, updated_at = CURRENT_TIMESTAMP
    `).bind(userId, userId, email).run();
  }
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
  if (message.includes("no such table") || message.includes("D1 binding") || message.includes("relation \"")) {
    return "The persistent database is not initialized yet. Apply infra/postgres/schema.sql (PostgreSQL) or deploy the latest D1 migrations, then try again.";
  }
  return message || "The database request failed.";
}

type NeonResult = { rows?: Array<Record<string, unknown>>; rowCount?: number | null };
type BoundQuery = { text: string; params: unknown[] };

/** Minimal D1-compatible prepared statement implemented with Neon HTTP SQL. */
class PostgresPreparedStatement {
  constructor(private readonly sql: ReturnType<typeof neon>, private readonly queryText: string, private readonly values: unknown[] = []) {}

  bind(...values: unknown[]) {
    return new PostgresPreparedStatement(this.sql, this.queryText, values);
  }

  toQuery(): BoundQuery {
    return { text: this.queryText, params: this.values };
  }

  async all<T extends Record<string, unknown>>() {
    const result = await this.execute();
    return { results: (result.rows || []) as T[], success: true, meta: { changes: Number(result.rowCount || 0) } };
  }

  async first<T extends Record<string, unknown>>(columnName?: string) {
    const row = ((await this.execute()).rows || [])[0] as T | undefined;
    if (!row) return null;
    return columnName ? (row[columnName] as unknown as T) : row;
  }

  async run() {
    const result = await this.execute();
    return { results: [], success: true, meta: { changes: Number(result.rowCount || 0) } };
  }

  private execute() {
    return this.sql.query(this.queryText, this.values) as unknown as Promise<NeonResult>;
  }
}

class PostgresD1Compatibility {
  private readonly sql: ReturnType<typeof neon>;

  constructor(connectionString: string) {
    this.sql = neon(connectionString, { fullResults: true });
  }

  prepare(queryText: string) {
    return new PostgresPreparedStatement(this.sql, normalizePostgresQuery(queryText));
  }

  async batch(statements: PostgresPreparedStatement[]) {
    const results = await this.sql.transaction((transaction) => statements.map((statement) => {
      const query = statement.toQuery();
      return transaction.query(query.text, query.params);
    }));
    const changes = results.reduce((total, result) => total + Number((result as NeonResult).rowCount || 0), 0);
    return { results: [], success: true, meta: { changes } };
  }
}

const postgresDatabases = new Map<string, PostgresD1Compatibility>();

function getPostgresDatabase(connectionString: string) {
  let database = postgresDatabases.get(connectionString);
  if (!database) {
    database = new PostgresD1Compatibility(connectionString);
    postgresDatabases.set(connectionString, database);
  }
  return database;
}

function normalizePostgresQuery(queryText: string) {
  let query = queryText
    .replace(/datetime\('now',\s*'-30 day'\)/gi, "CURRENT_TIMESTAMP - INTERVAL '30 days'")
    .replace(/datetime\('now',\s*'-1 day'\)/gi, "CURRENT_TIMESTAMP - INTERVAL '1 day'")
    .replace(/notifications_enabled\s*=\s*1\b/gi, "notifications_enabled = TRUE");
  let index = 0;
  query = query.replace(/\?/g, () => `$${++index}`);
  return query;
}

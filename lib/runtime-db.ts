import { neon } from "@neondatabase/serverless";

type QueryResult = {
  rows?: Array<Record<string, unknown>>;
  rowCount?: number | null;
};

export type PreparedStatement = {
  bind(...values: unknown[]): PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true; meta: { changes: number } }>;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run(): Promise<{ results: never[]; success: true; meta: { changes: number } }>;
};

export type Database = {
  prepare(queryText: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<{ results: never[]; success: true; meta: { changes: number } }>;
};

export function runtimeEnv(): Record<string, string | undefined> {
  return process.env;
}

/**
 * PostgreSQL is the only application database in the production runtime.
 * Neon’s HTTP driver is safe for Vercel serverless/Node route handlers and
 * avoids connection exhaustion during bursty traffic.
 */
export function getDatabase(): Database {
  const connectionString = runtimeEnv().DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured. Add the pooled Neon connection string to the server environment.");
  return getPostgresDatabase(connectionString);
}

export async function ensureUserSettings(database: Database, userId: string, email: string, displayName?: string | null) {
  await database.prepare(`
    INSERT INTO users (id, auth_subject, email, display_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = COALESCE(excluded.display_name, users.display_name), updated_at = CURRENT_TIMESTAMP
  `).bind(userId, userId, email, displayName || null).run();
  await database.prepare(`
    INSERT INTO user_settings (owner_user_id, email)
    VALUES (?, ?)
    ON CONFLICT(owner_user_id) DO UPDATE SET email = excluded.email, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, email).run();
}

export function requestOrigin(request: Request) {
  const configuredOrigin = runtimeEnv().NEXT_PUBLIC_APP_URL;
  if (configuredOrigin) {
    try {
      const configuredUrl = new URL(configuredOrigin);
      if (configuredUrl.protocol === "http:" || configuredUrl.protocol === "https:") return configuredUrl.origin;
    } catch {
      // Fall back to the platform request origin and let the OAuth provider reject a bad callback.
    }
  }
  const forwardedProtocol = request.headers.get("x-forwarded-proto") || "https";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  return `${forwardedProtocol}://${host}`;
}

export function databaseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("DATABASE_URL") || message.includes("relation \"") || message.includes("does not exist")) {
    return "The PostgreSQL database is not initialized or is unavailable. Run npm run db:postgres:migrate against the configured Neon database, then try again.";
  }
  return message || "The database request failed.";
}

class PostgresPreparedStatement implements PreparedStatement {
  constructor(private readonly sql: ReturnType<typeof neon>, private readonly queryText: string, private readonly values: unknown[] = []) {}

  bind(...values: unknown[]) {
    return new PostgresPreparedStatement(this.sql, this.queryText, values);
  }

  toQuery() {
    return { text: this.queryText, params: this.values };
  }

  async all<T = Record<string, unknown>>() {
    const result = await this.execute();
    return { results: (result.rows || []) as T[], success: true as const, meta: { changes: Number(result.rowCount || 0) } };
  }

  async first<T = Record<string, unknown>>(columnName?: string) {
    const row = ((await this.execute()).rows || [])[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return (columnName ? row[columnName] : row) as T;
  }

  async run() {
    const result = await this.execute();
    return { results: [], success: true as const, meta: { changes: Number(result.rowCount || 0) } };
  }

  private execute() {
    return this.sql.query(this.queryText, this.values) as unknown as Promise<QueryResult>;
  }
}

class PostgresDatabase implements Database {
  private readonly sql: ReturnType<typeof neon>;

  constructor(connectionString: string) {
    this.sql = neon(connectionString, { fullResults: true });
  }

  prepare(queryText: string) {
    return new PostgresPreparedStatement(this.sql, normalizePostgresQuery(queryText));
  }

  async batch(statements: PreparedStatement[]) {
    const results = await this.sql.transaction((transaction) => statements.map((statement) => {
      if (!(statement instanceof PostgresPreparedStatement)) throw new Error("All batched statements must use the application PostgreSQL client.");
      const query = statement.toQuery();
      return transaction.query(query.text, query.params);
    }));
    const changes = results.reduce((total, result) => total + Number((result as QueryResult).rowCount || 0), 0);
    return { results: [], success: true as const, meta: { changes } };
  }
}

const databases = new Map<string, PostgresDatabase>();

function getPostgresDatabase(connectionString: string) {
  let database = databases.get(connectionString);
  if (!database) {
    database = new PostgresDatabase(connectionString);
    databases.set(connectionString, database);
  }
  return database;
}

/** Convert the legacy bind shape to numbered PostgreSQL parameters. */
function normalizePostgresQuery(queryText: string) {
  let query = queryText
    .replace(/datetime\('now',\s*'-30 day'\)/gi, "CURRENT_TIMESTAMP - INTERVAL '30 days'")
    .replace(/datetime\('now',\s*'-1 day'\)/gi, "CURRENT_TIMESTAMP - INTERVAL '1 day'")
    .replace(/notifications_enabled\s*=\s*1\b/gi, "notifications_enabled = 1");
  let index = 0;
  query = query.replace(/\?/g, () => `$${++index}`);
  return query;
}

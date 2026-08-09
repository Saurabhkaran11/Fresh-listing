import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const jobPostings = sqliteTable("job_postings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerUserId: text("owner_user_id").notNull(),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull().default("Location not listed"),
  source: text("source").notNull(),
  directUrl: text("direct_url").notNull(),
  applyUrl: text("apply_url"),
  description: text("description").notNull().default(""),
  postedAt: text("posted_at"),
  remoteStatus: text("remote_status"),
  experience: text("experience"),
  salary: text("salary"),
  skillsJson: text("skills_json").notNull().default("[]"),
  fitScore: integer("fit_score"),
  fitSummary: text("fit_summary"),
  skillGaps: text("skill_gaps"),
  portfolioProjects: text("portfolio_projects"),
  searchQuery: text("search_query").notNull().default(""),
  capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  syncedAt: text("synced_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  ownerExternal: uniqueIndex("job_postings_owner_external_idx").on(table.ownerUserId, table.externalId),
}));

export const scrapeRuns = sqliteTable("scrape_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerUserId: text("owner_user_id").notNull(),
  provider: text("provider").notNull(),
  keywords: text("keywords").notNull(),
  location: text("location").notNull(),
  timeWindow: text("time_window").notNull(),
  resultCount: integer("result_count").notNull().default(0),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const userSettings = sqliteTable("user_settings", {
  ownerUserId: text("owner_user_id").primaryKey(),
  email: text("email").notNull(),
  keywordsJson: text("keywords_json").notNull().default("[\"Software engineer\"]"),
  locationsJson: text("locations_json").notNull().default("[\"United States\"]"),
  selectedSourcesJson: text("selected_sources_json").notNull().default("[\"google_jobs\",\"greenhouse\"]"),
  digestEnabled: integer("digest_enabled", { mode: "boolean" }).notNull().default(false),
  digestHour: text("digest_hour").notNull().default("08:00"),
  spreadsheetId: text("spreadsheet_id"),
  googleRefreshToken: text("google_refresh_token"),
  googleAccessToken: text("google_access_token"),
  googleAccessExpiresAt: integer("google_access_expires_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

/**
 * A Telegram chat can be linked to exactly one Fresh Listings account.  The
 * separate link-token table keeps the one-time hand-off short-lived and
 * prevents a bot chat id from ever being used as an account credential.
 */
export const telegramLinks = sqliteTable("telegram_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerUserId: text("owner_user_id").notNull(),
  chatId: text("chat_id").notNull(),
  username: text("username"),
  displayName: text("display_name"),
  notificationsEnabled: integer("notifications_enabled", { mode: "boolean" }).notNull().default(true),
  linkedAt: text("linked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  ownerUnique: uniqueIndex("telegram_links_owner_idx").on(table.ownerUserId),
  chatUnique: uniqueIndex("telegram_links_chat_idx").on(table.chatId),
}));

export const telegramLinkTokens = sqliteTable("telegram_link_tokens", {
  token: text("token").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
});

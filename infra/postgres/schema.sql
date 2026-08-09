-- Production PostgreSQL baseline. Apply with a migration tool in CI, not by
-- pasting into a production console without a backup.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  email text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text NOT NULL,
  company text NOT NULL,
  location text NOT NULL DEFAULT 'Location not listed',
  source text NOT NULL,
  direct_url text NOT NULL,
  apply_url text,
  description text NOT NULL DEFAULT '',
  posted_at timestamptz,
  remote_status text,
  experience text,
  salary text,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  fit_score smallint CHECK (fit_score BETWEEN 0 AND 100),
  fit_summary text,
  skill_gaps jsonb,
  portfolio_projects jsonb,
  search_query text NOT NULL DEFAULT '',
  captured_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, external_id)
);

CREATE INDEX IF NOT EXISTS job_postings_owner_created_idx ON job_postings (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_postings_owner_source_idx ON job_postings (owner_user_id, source, created_at DESC);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  keywords text NOT NULL,
  location text NOT NULL,
  time_window text NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  error text,
  idempotency_key text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scrape_runs_owner_idempotency_idx
  ON scrape_runs (owner_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_drive', 'telegram')),
  provider_account_id text,
  provider_account_email text,
  encrypted_refresh_token text,
  encrypted_access_token text,
  access_token_expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, provider)
);

CREATE TABLE IF NOT EXISTS user_settings (
  owner_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  keywords jsonb NOT NULL DEFAULT '["Software engineer"]'::jsonb,
  locations jsonb NOT NULL DEFAULT '["United States"]'::jsonb,
  selected_sources jsonb NOT NULL DEFAULT '["google_jobs", "greenhouse"]'::jsonb,
  digest_enabled boolean NOT NULL DEFAULT false,
  digest_hour text NOT NULL DEFAULT '08:00',
  google_drive_folder_id text,
  spreadsheet_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  chat_id text NOT NULL UNIQUE,
  username text,
  display_name text,
  notifications_enabled boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
  ON outbox_events (available_at, created_at)
  WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS daily_metrics (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_day date NOT NULL,
  jobs_searched integer NOT NULL DEFAULT 0,
  jobs_saved integer NOT NULL DEFAULT 0,
  search_runs integer NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_user_id, metric_day)
);

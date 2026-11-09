-- CasaFacile Cloudflare D1 v1 — SQLite
-- Do NOT include user secrets. Use Cloudflare Access + Worker membership checks for authorization.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_operation_id TEXT,
  backup_revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(household_id,email)
);

CREATE INDEX IF NOT EXISTS member_email_idx ON household_members(email);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_operation_id TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS invites_home_idx ON invitations(household_id,expires_at);

CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  r2_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes > 0),
  sha256 TEXT NOT NULL,
  UNIQUE(household_id,revision)
);
CREATE INDEX IF NOT EXISTS backups_home_idx ON backups(household_id,revision DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL,
  event TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details TEXT
);
CREATE INDEX IF NOT EXISTS audits_home_idx ON audit_events(household_id,created_at DESC);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  github_id TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('objekts','stats','schedule','market','tools','wiki','hub')),
  added_at TEXT NOT NULL,
  accent TEXT NOT NULL DEFAULT 'blue' CHECK (accent IN ('blue','amber','violet')),
  theme TEXT NOT NULL DEFAULT 'auto' CHECK (theme IN ('auto','light','dark')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  archived_at TEXT,
  archive_reason TEXT,
  archive_url TEXT,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  links_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  edit_token TEXT
);

CREATE TABLE project_translations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lang TEXT NOT NULL CHECK (lang IN ('en','ko')),
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  badges_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (project_id, lang)
);

CREATE TABLE verification_challenges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('dns','meta')),
  target_url TEXT NOT NULL,
  expected_url TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_checked_at INTEGER
);
CREATE INDEX challenges_user ON verification_challenges(user_id, project_id);
CREATE INDEX challenges_expiry ON verification_challenges(expires_at);

CREATE TABLE project_owners (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  verified_at INTEGER NOT NULL,
  verification_method TEXT NOT NULL CHECK (verification_method IN ('dns','meta')),
  verified_url TEXT NOT NULL,
  challenge_id TEXT NOT NULL
);
CREATE INDEX owners_user ON project_owners(user_id);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE INDEX rate_limits_expiry ON rate_limits(reset_at);

-- Website-banner links found on each project's registered page.
-- A project is featured while its link was found recently and has not been missing twice in a row.
-- override lets a maintainer feature a project the checker cannot read, or exclude an abusive one.
CREATE TABLE project_backlinks (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('found','missing','unreachable')),
  detected_by TEXT CHECK (detected_by IN ('html','rendered','manual')),
  link_href TEXT,
  first_found_at INTEGER,
  last_found_at INTEGER,
  last_checked_at INTEGER NOT NULL,
  miss_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  override TEXT CHECK (override IN ('force_on','force_off')),
  override_note TEXT
);
CREATE INDEX backlinks_checked ON project_backlinks(last_checked_at);

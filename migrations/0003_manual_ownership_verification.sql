-- Preserve existing ownership while allowing explicit maintainer approvals.
-- Manual grants store an audit reference in challenge_id, not a proof token.
CREATE TABLE project_owners_with_manual (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  verified_at INTEGER NOT NULL,
  verification_method TEXT NOT NULL CHECK (verification_method IN ('dns','meta','manual')),
  verified_url TEXT NOT NULL,
  challenge_id TEXT NOT NULL
);

INSERT INTO project_owners_with_manual
  (project_id, user_id, verified_at, verification_method, verified_url, challenge_id)
SELECT project_id, user_id, verified_at, verification_method, verified_url, challenge_id
FROM project_owners;

DROP TABLE project_owners;
ALTER TABLE project_owners_with_manual RENAME TO project_owners;
CREATE INDEX owners_user ON project_owners(user_id);

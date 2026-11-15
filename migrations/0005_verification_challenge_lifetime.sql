-- Keep already deployed DNS/HTML proofs usable while slow caches update.
-- Expiry is measured from issuance, not from this migration's execution time.
UPDATE verification_challenges
SET expires_at = created_at + 172800000
WHERE consumed_at IS NULL
  AND expires_at < created_at + 172800000
  AND created_at + 172800000 > unixepoch() * 1000;

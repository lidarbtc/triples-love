-- Keep the token itself so a signed-in claimant can return to an unfinished
-- proof and so restarting for the same address reuses the published value.
-- The token is public once published and only works for its own account.
-- Rows created before this migration keep a NULL token and cannot be resumed.
ALTER TABLE verification_challenges ADD COLUMN token TEXT;

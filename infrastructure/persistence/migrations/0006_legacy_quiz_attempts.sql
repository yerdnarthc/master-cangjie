ALTER TABLE quiz_attempts
  ADD COLUMN is_legacy boolean NOT NULL DEFAULT false;

-- Every attempt that predates this migration came from historical submissions
-- or a divergent pre-attempt draft. Keep accepting those clients during recovery.
UPDATE quiz_attempts SET is_legacy = true;

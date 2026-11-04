CREATE TABLE quiz_attempts (
  id uuid PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learner_accounts(id),
  topic_id text NOT NULL REFERENCES topics(id),
  assessment_revision integer NOT NULL CHECK (assessment_revision > 0),
  state text NOT NULL CHECK (state IN ('answering', 'submitted')),
  submission_id uuid UNIQUE REFERENCES topic_submissions(id),
  predecessor_submission_id uuid REFERENCES topic_submissions(id),
  started_work_revision integer NOT NULL CHECK (started_work_revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, topic_id, id),
  CHECK (
    (state = 'answering' AND submission_id IS NULL)
    OR (state = 'submitted' AND submission_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX quiz_attempts_predecessor_submission_unique
  ON quiz_attempts(predecessor_submission_id)
  WHERE predecessor_submission_id IS NOT NULL;

ALTER TABLE quiz_drafts ADD COLUMN attempt_id uuid;
ALTER TABLE quiz_draft_conflicts ADD COLUMN attempt_id uuid;

-- Preserve every finalized multiple-choice submission as its own historical attempt.
INSERT INTO quiz_attempts(
  id, learner_id, topic_id, assessment_revision, state, submission_id, started_work_revision
)
SELECT
  s.id,
  s.learner_id,
  s.snapshot->>'topicId',
  (s.snapshot->'assessment'->>'revision')::integer,
  'submitted',
  s.id,
  0
FROM topic_submissions s
JOIN topics t ON t.id = s.snapshot->>'topicId' AND t.kind = 'multiple-choice'
WHERE s.state = 'finalized'
  AND s.snapshot->>'kind' = 'multiple-choice'
  AND s.snapshot->'assessment'->>'revision' ~ '^[0-9]+$'
ON CONFLICT (id) DO NOTHING;

-- A draft exactly matching the latest finalized snapshot remains submitted/read-only.
WITH latest AS (
  SELECT DISTINCT ON (s.learner_id, s.snapshot->>'topicId')
    s.learner_id, s.snapshot->>'topicId' AS topic_id, s.id, s.snapshot
  FROM topic_submissions s
  JOIN topics t ON t.id = s.snapshot->>'topicId' AND t.kind = 'multiple-choice'
  WHERE s.state = 'finalized' AND s.snapshot->>'kind' = 'multiple-choice'
  ORDER BY s.learner_id, s.snapshot->>'topicId', s.created_at DESC, s.id DESC
)
UPDATE quiz_drafts d
SET attempt_id = latest.id
FROM latest
WHERE d.learner_id = latest.learner_id
  AND d.topic_id = latest.topic_id
  AND d.answers = latest.snapshot->'answers';

-- Divergent drafts remain editable as a separate legacy attempt; do not overwrite them with history.
INSERT INTO quiz_attempts(
  id, learner_id, topic_id, assessment_revision, state, started_work_revision
)
SELECT
  gen_random_uuid(), d.learner_id, d.topic_id, t.current_revision, 'answering', d.work_revision
FROM quiz_drafts d
JOIN topics t ON t.id = d.topic_id AND t.kind = 'multiple-choice'
WHERE d.attempt_id IS NULL;

UPDATE quiz_drafts d
SET attempt_id = a.id
FROM quiz_attempts a
WHERE a.learner_id = d.learner_id
  AND a.topic_id = d.topic_id
  AND a.state = 'answering'
  AND a.started_work_revision = d.work_revision
  AND d.attempt_id IS NULL;

-- Learners with history but no draft row resume the latest submitted attempt and answers.
WITH latest AS (
  SELECT DISTINCT ON (s.learner_id, s.snapshot->>'topicId')
    s.learner_id, s.snapshot->>'topicId' AS topic_id, s.id, s.snapshot
  FROM topic_submissions s
  JOIN topics t ON t.id = s.snapshot->>'topicId' AND t.kind = 'multiple-choice'
  WHERE s.state = 'finalized' AND s.snapshot->>'kind' = 'multiple-choice'
  ORDER BY s.learner_id, s.snapshot->>'topicId', s.created_at DESC, s.id DESC
)
INSERT INTO quiz_drafts(learner_id, topic_id, attempt_id, answers, work_revision)
SELECT latest.learner_id, latest.topic_id, latest.id, latest.snapshot->'answers', 0
FROM latest
WHERE NOT EXISTS (
  SELECT 1 FROM quiz_drafts d
  WHERE d.learner_id = latest.learner_id AND d.topic_id = latest.topic_id
);

UPDATE quiz_draft_conflicts c
SET attempt_id = d.attempt_id
FROM quiz_drafts d
WHERE c.learner_id = d.learner_id AND c.topic_id = d.topic_id;

ALTER TABLE quiz_drafts ALTER COLUMN attempt_id SET NOT NULL;
ALTER TABLE quiz_draft_conflicts ALTER COLUMN attempt_id SET NOT NULL;

ALTER TABLE quiz_drafts
  ADD CONSTRAINT quiz_drafts_attempt_fk
  FOREIGN KEY (learner_id, topic_id, attempt_id)
  REFERENCES quiz_attempts(learner_id, topic_id, id);

ALTER TABLE quiz_draft_conflicts
  ADD CONSTRAINT quiz_draft_conflicts_attempt_fk
  FOREIGN KEY (learner_id, topic_id, attempt_id)
  REFERENCES quiz_attempts(learner_id, topic_id, id);

DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='mcj_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON quiz_attempts TO mcj_app;
  END IF;
END $$;

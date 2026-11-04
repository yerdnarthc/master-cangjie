-- A pre-attempt submission could be finalized while a draft conflict was open.
-- Keep that submission immutable, but move the active draft and unresolved
-- candidates to a legacy answering attempt so the learner can explicitly recover them.
WITH conflicted AS (
  SELECT
    d.learner_id,
    d.topic_id,
    d.attempt_id AS submitted_attempt_id,
    d.work_revision,
    a.assessment_revision
  FROM quiz_drafts d
  JOIN quiz_attempts a
    ON a.id = d.attempt_id
   AND a.learner_id = d.learner_id
   AND a.topic_id = d.topic_id
  WHERE a.state = 'submitted'
    AND EXISTS (
      SELECT 1
      FROM quiz_draft_conflicts c
      WHERE c.learner_id = d.learner_id
        AND c.topic_id = d.topic_id
        AND c.attempt_id = d.attempt_id
        AND c.resolved = false
    )
), inserted AS (
  INSERT INTO quiz_attempts(
    id,
    learner_id,
    topic_id,
    assessment_revision,
    state,
    started_work_revision,
    is_legacy
  )
  SELECT
    gen_random_uuid(),
    learner_id,
    topic_id,
    assessment_revision,
    'answering',
    work_revision,
    true
  FROM conflicted
  RETURNING id, learner_id, topic_id
), attempt_map AS (
  SELECT
    c.learner_id,
    c.topic_id,
    c.submitted_attempt_id,
    i.id AS answering_attempt_id
  FROM conflicted c
  JOIN inserted i USING (learner_id, topic_id)
), drafts_reassigned AS (
  UPDATE quiz_drafts d
  SET attempt_id = m.answering_attempt_id
  FROM attempt_map m
  WHERE d.learner_id = m.learner_id
    AND d.topic_id = m.topic_id
    AND d.attempt_id = m.submitted_attempt_id
  RETURNING d.learner_id, d.topic_id
)
UPDATE quiz_draft_conflicts c
SET attempt_id = m.answering_attempt_id
FROM attempt_map m
WHERE c.learner_id = m.learner_id
  AND c.topic_id = m.topic_id
  AND c.attempt_id = m.submitted_attempt_id
  AND c.resolved = false;

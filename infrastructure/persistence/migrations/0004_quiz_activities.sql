CREATE TABLE quiz_drafts (
  learner_id uuid REFERENCES learner_accounts(id),
  topic_id text REFERENCES topics(id),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  work_revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(learner_id, topic_id)
);

CREATE TABLE quiz_draft_conflicts (
  id uuid PRIMARY KEY,
  learner_id uuid REFERENCES learner_accounts(id),
  topic_id text REFERENCES topics(id),
  base_revision integer NOT NULL,
  candidate_answers jsonb NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='mcj_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON quiz_drafts, quiz_draft_conflicts TO mcj_app;
  END IF;
END $$;

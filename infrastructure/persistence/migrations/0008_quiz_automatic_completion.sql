-- Complete formerly unmarked quizzes using only their own valid finalized evidence.
WITH evidence AS (
 SELECT DISTINCT s.learner_id, t.id AS topic_id
 FROM topic_submissions s
 JOIN topics t ON t.id=s.snapshot->>'topicId' AND t.kind='multiple-choice'
 JOIN assessment_revisions r ON r.topic_id=t.id
   AND r.revision::text=s.snapshot->'assessment'->>'revision'
 WHERE s.state='finalized' AND s.snapshot->>'kind'='multiple-choice'
   AND s.snapshot->'assessment'->>'topicId'=t.id
   AND jsonb_typeof(s.score->'earned')='number'
   AND jsonb_typeof(s.score->'possible')='number'
   AND CASE WHEN s.score->>'earned' ~ '^[0-9]+$' AND s.score->>'possible' ~ '^[0-9]+$'
     THEN (s.score->>'possible')::numeric > 0
       AND (s.score->>'earned')::numeric <= (s.score->>'possible')::numeric
       AND mod((s.score->>'earned')::numeric,10)=0
       AND mod((s.score->>'possible')::numeric,10)=0
       AND 5*(s.score->>'earned')::numeric >= 3*(s.score->>'possible')::numeric
     ELSE false END
), completed AS (
 UPDATE learner_topic_progress p SET completed=true
 FROM evidence e WHERE p.learner_id=e.learner_id AND p.topic_id=e.topic_id AND p.available
 RETURNING p.learner_id,p.topic_id
)
UPDATE learner_topic_progress p SET available=true
FROM completed c JOIN topics current_topic ON current_topic.id=c.topic_id
JOIN topics next_topic ON next_topic.position=current_topic.position+1
WHERE p.learner_id=c.learner_id AND p.topic_id=next_topic.id;

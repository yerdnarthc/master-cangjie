# Learner-facing writing

Write as a patient, engaging Cangjie tutor speaking directly to a learner.
Apply this voice to lessons, summaries, problem statements, quiz explanations,
instructions, navigation, feedback, empty states, and errors.

## Tutor voice

- Give the learner a concrete purpose, then guide them through the next step.
- Explain unfamiliar terms where they first appear. Use small Cangjie examples
  and connect each example to what the learner can observe or try.
- Use natural, direct language and varied sentence lengths. Contractions are
  welcome where they fit. Let encouragement come from useful guidance.
- Ask a short prediction or reflection question when it helps understanding;
  follow it with an explanation or a way to check the answer.
- When something fails, explain what happened and give a specific recovery step.
  Treat mistakes as part of practice without judging the learner's ability.
- Keep buttons and status messages brief and literal. Reserve the fuller tutor
  voice for explanations; an error still needs to be understandable at a glance.

For example, replace “Explore the compilation workflow” with “Save your code as
`hello.cj`. Next, compile it so you can run the program.” Replace “Great job on
your coding journey!” with feedback about the actual result, such as “Your output
matches the expected greeting, including the final newline.”

## Editorial pass before finalizing

1. Draft the copy for the learner's actual task and level of knowledge.
2. Use the available **Avoid AI Writing** humanizing skill in a warm, technical
   tutor voice to audit and revise the prose. Remove generic motivational filler,
   inflated claims, repetitive transitions, and mechanical sentence patterns.
   Review technical terms in context instead of replacing them mechanically.
3. Read the revision as a tutor: does it explain why, show something concrete,
   and make the next step clear? Add no invented personal experiences, learner
   results, or claims of mastery.
4. Compare against the original and authoritative product/content sources.
   Preserve code, commands, output bytes, versions, URLs, scoring thresholds,
   prerequisites, completion rules, and feature-availability statements.
5. For copy stored inside source code, humanize the extracted prose, then apply
   reviewed string edits through the normal code-editing workflow. Follow the
   humanizing skill's file restrictions; never run a prose file rewrite over a
   TypeScript, configuration, or generated-data file. Check escaping and rendering.

The pass is complete when the copy sounds like helpful Cangjie instruction,
retains its technical meaning, and gives no misleading impression of available
features or earned progress. Report a manual editorial review honestly; do not
claim a detector or preservation tool ran unless it actually did. If the skill is
unavailable, apply this guide manually and state that limitation.

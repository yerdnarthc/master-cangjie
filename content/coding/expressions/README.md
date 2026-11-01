# Expressions

Category: Basic Concepts. Follows Program Structure and precedes Functions.
All six problems are complete, runtime verified, reviewed and approved by the
maintainer as of 2026-11-01.

| Suggested order | Problem | Reference approach | Cases | Points |
| --- | --- | --- | --- | --- |
| 1 | [Find Your Robot Crew](score-band/problem.md) | if / else if / else | 6 | 60 |
| 2 | [Select the Smaller Value](smaller-value/problem.md) | if as an initializer value | 6 | 60 |
| 3 | [Countdown to the Stars](countdown/problem.md) | while, including zero iterations | 6 | 60 |
| 4 | [Run the Counter at Least Once](run-at-least-once/problem.md) | do-while, including initially nonpositive counters | 6 | 60 |
| 5 | [Sum the Interval](sum-the-interval/problem.md) | for-in over an inclusive interval | 6 | 60 |
| 6 | [Skip Some, Stop Early](skip-and-stop/problem.md) | break and continue | 6 | 60 |

Find Your Robot Crew and Countdown to the Stars pair inviting titles with short
story settings. Two of six items (approximately 33%) apply the approximate 25%
creative-title-and-description target
to this topic. Their narratives provide context for the existing tasks.

Each problem has three visible samples and three hidden cases. Its six input
cases target distinct boundaries, branches or iteration behavior. Exact case
bytes live in tests/; samples identify the corresponding visible cases. All
cases are valid inputs under the public constraints. There are no surprise
malformed-input requirements.

All six problems carry equal maximum weight. The topic has 36 tests and 360
possible points. Under the accepted 60% rule, the first attainable passing score
is 220/360. Passing does not require completing every problem or using every
suggested construct. Problem order is practice guidance, not an access restriction.

The [official Expressions chapter](https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/basic_programming_concepts/expression.html)
introduces conditional values, loop expressions and control transfers. This set
targets the ordinary Boolean-condition and integer-loop forms. Pattern conditions,
tuple/array iteration and exception expressions depend on later concepts and
are deferred. The for-in where filter and expression type details should receive
lesson examples; these exercises do not claim full coverage of every chapter form.

The starter programs supply console reading and integer parsing so learners can
focus on control flow. Lessons must explain the small amount of comparison,
arithmetic and range notation used here, despite their later dedicated topics.
Starters intentionally produce no output. Preserve each supplied input read when
solving; source structure is guidance, with no configured structural gate.

The [content checker](../../../tools/evaluator/README.md#verify-coding-content)
currently assumes passing starters. It needs an explicit expectation for
incomplete starters before it can validate these problem directories unchanged.
Reference verification evidence is recorded separately in each assessment file.
Hidden cases and reference material must remain excluded from learner payloads.

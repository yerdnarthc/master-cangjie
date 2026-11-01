# Program Structure

Category: Basic Concepts. This topic follows the Identifiers multiple-choice
topic and precedes Expressions, in the accepted roadmap order. All three coding problems are complete, reviewed, verified and approved by the
maintainer as of 2026-11-01. The content is ready for integration.

| Suggested practice order | Problem | Focus | Tests | Maximum points |
| --- | --- | --- | --- | --- |
| 1 | [Build a Program Card](program-card/problem.md) | Entry point, immutable local bindings and ordered output | 1 | 10 |
| 2 | [Update the Session Status](update-session-status/problem.md) | Immutable and mutable bindings, reassignment | 1 | 10 |
| 3 | [Global and Local Labels](global-and-local-labels/problem.md) | Top-level/local scope and shadowing | 1 | 10 |

The order is guidance; problems within an unlocked topic remain accessible in
any order. Each problem has one empty-input case containing its entire fixed
output transcript, shown as its sample. Repeated identical-input cases cannot
add coverage here. There are three tests total, equally weighting the problems.
Under the existing scoring policy, passing any two earns 20/30 and passes the
topic. This does not require demonstrated success on every concept.

The exercises encourage the listed constructs but have no structural gates.
Correct output can be hardcoded; these tests do not prove mutability or scope
usage. Mandatory use of those constructs would require published structural
rules and a reliable analyzer before publication of gated revisions.

The reference solutions cover a beginner subset of the official
[Program Structure chapter](https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/basic_programming_concepts/program_structure.html):
entry point, bindings and scope. User-defined types, value/reference-type
semantics, and detailed function construction are deferred to suitable later
material; this set does not claim full chapter mastery.

Each starter compiles but intentionally lacks the required output. The existing
content checker assumes both starter and reference pass, so it needs an explicit
incomplete-starter expectation before it can verify this entire topic unchanged.
Recorded authoring checks live in each assessment specification.

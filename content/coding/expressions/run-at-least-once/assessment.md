# Assessment specification

## Identity and revision

- Problem ID: `expressions/run-at-least-once`
- Category: Basic Concepts
- Topic: Expressions
- Problem slug: `run-at-least-once`
- Assessment revision: 1
- Readiness: Complete; runtime verified, learner-facing content reviewed and approved.
- Toolchain: Cangjie LTS 1.0.5

## Assessment intent

Practice do-while. The reference demonstrates this construct; behavioral tests do not prove its use. Supplied input parsing isolates the expression exercise from later I/O instruction.

## Execution contract

Compile the complete console source and run separately with each input file. Require successful execution and exact UTF-8 stdout bytes, including final LF. Only valid inputs under the public constraints are assessed. Expected outputs are authoritative in tests/; the three visible cases are the samples.

## Test inventory

| Case ID | Visibility | Input file | Expected-output file | Coverage purpose | Used as sample |
| --- | --- | --- | --- | --- | --- |
| case-01 | Visible | `tests/case-01.in` | `tests/case-01.out` | initial condition would be false | Yes |
| case-02 | Visible | `tests/case-02.in` | `tests/case-02.out` | exactly one positive iteration | Yes |
| case-03 | Visible | `tests/case-03.in` | `tests/case-03.out` | multiple iterations | Yes |
| case-04 | Hidden | `tests/case-04.in` | `tests/case-04.out` | minimum, negative still printed | No |
| case-05 | Hidden | `tests/case-05.in` | `tests/case-05.out` | two iterations | No |
| case-06 | Hidden | `tests/case-06.in` | `tests/case-06.out` | maximum | No |

## Scoring rationale

Six distinct input cases, each worth 10 points: maximum 60. Three are visible and three hidden; both count equally. Six problems give this topic 360 possible points, passing at 220/360 or higher under the existing 60% rule (216 points rounded up to the next attainable multiple of ten). Tests cover semantic boundaries and ordinary behavior; they are not weighted by difficulty. Individual runs award no points.

## Structural requirements

None configured. Do not penalize an equivalent solution for omitting do-while. Any future mandatory construct needs a supported rule, reliable analyzer, matching public instruction and a new assessment revision.

## Reference-solution verification

On 2026-11-01, the actual reference/source and input/output files were copied to the existing Linux evaluator. The maintained runner compiled and ran the reference separately against all six cases with Cangjie Compiler 1.0.5; all six exact-output comparisons passed and cleanup was confirmed. The starter was separately compiled and run with case-01: it exited successfully with no output, correctly failing that case. Other starter cases were not executed.

Local evidence report: `expressions-authoring-005591aedca74ee7a73686c27082d1e7.json` in the evaluator's ignored `results/` directory. It records source/input/expected-output hashes and exact per-run report references for 36 reference runs and six starter runs across the topic. Verification used the maintained runner through explicit authoring checks; the existing content checker assumes passing starters and cannot verify this expectation unchanged.

## Incorrect-solution checks

Case coverage targets: Using pre-check semantics for zero/negative input, printing the decremented value first, printing an extra zero. No mutation runs have been recorded. Hidden results must expose pass/fail only under the existing feedback policy.

## Review and publication

Content preparation is complete for assessment revision 1. The maintainer reviewed and approved all Expressions coding content on 2026-11-01. Runtime verification is recorded above. Content is ready for integration and publication through the application's content workflow. Future scoring-affecting corrections follow the established revision/correction policy.

## Sources

The official [Expressions chapter](https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/basic_programming_concepts/expression.html) supplies the construct semantics. Exercises and scenarios are original. The documentation route is 1.0.0; executable verification targets the product's pinned 1.0.5 compiler.

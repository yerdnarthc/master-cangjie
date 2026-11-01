# Assessment specification

## Identity and revision

- Problem ID: `functions/moon-crew-snacks`
- Category: Basic Concepts
- Topic: Functions (introductory)
- Problem slug: `moon-crew-snacks`
- Assessment revision: 1
- Readiness: Complete; runtime verified, learner-facing content reviewed and approved.
- Toolchain: Cangjie LTS 1.0.5

## Assessment intent

Define a function with one typed parameter and return its computed result. The reference uses the suggested helper. This is introductory definition/call practice, with no recursion, overloading, closures, function values or advanced parameter rules.

## Execution contract

Compile the complete console program, run with each exact input file and require successful execution and exact UTF-8 stdout, including final LF. The suggested helper is not an external callable grading contract; main controls console output. Empty input requires a zero-byte .in file.

## Test inventory

| Case ID | Visibility | Input file | Expected-output file | Coverage purpose | Used as sample |
| --- | --- | --- | --- | --- | --- |
| case-01 | Visible | `tests/case-01.in` | `tests/case-01.out` | zero crew | Yes |
| case-02 | Visible | `tests/case-02.in` | `tests/case-02.out` | single crew member | Yes |
| case-03 | Visible | `tests/case-03.in` | `tests/case-03.out` | ordinary group | Yes |
| case-04 | Hidden | `tests/case-04.in` | `tests/case-04.out` | larger group | No |
| case-05 | Hidden | `tests/case-05.in` | `tests/case-05.out` | maximum crew | No |

## Scoring rationale

5 cases, maximum 50 points; each passing case earns 10 in batch validation. Individual runs award no points. The topic's 1/5/6 test distribution gives 10/50/60 possible points respectively, for 120 total. The first attainable passing topic score is 80/120. The fixed-output warm-up is deliberately low weight; duplicate empty-input tests add no coverage. The multi-input task has an additional case to exercise both signed-result limits.

## Structural requirements

None. Do not reject equivalent behavior because it bypasses the suggested helper. Mandatory function definitions/calls would require an approved supported rule and reliable analyzer, matching public instructions and a new assessment revision.

## Reference-solution verification

On 2026-11-01, copies of the actual reference and test files were compiled and executed using the maintained sandbox runner and Cangjie Compiler 1.0.5. Every reference case matched expected stdout byte for byte and exited successfully, with confirmed cleanup. Each starter was compiled and run against case-01: it exited successfully with empty stdout, correctly failing the output comparison. Other starter cases were not run.

Local evidence: `functions-authoring-dd556b9c998f49db90bc72aa8810a957.json` in the evaluator's ignored results/ directory. This report records source/input/expected-output hashes and exact per-run report references for 12 reference checks and three starter checks across the topic. These authoring checks invoked runner.py directly; the current content checker assumes passing starters and cannot check this expectation unchanged.

## Incorrect-solution checks

Cases target: Returning the input unchanged, using a fixed answer, multiplying by the wrong amount. No incorrect-source mutation runs have been recorded. Hidden cases must reveal pass/fail only. These cases do not establish how a learner organized the code.

## Review and publication

Content preparation is complete for assessment revision 1. The maintainer approved all introductory Functions coding content on 2026-11-01. Runtime verification is recorded above. The approved content includes the intentionally unequal test weighting and absence of structural gates, and is ready for integration and publication through the application's content workflow. Future scoring-affecting corrections follow the established assessment revision policy.

## Source alignment

The official [introductory Functions chapter](https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/basic_programming_concepts/function.html) introduces definition syntax, typed parameters and returning a value. The later [Function Definition chapter](https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/function/define_functions.html) belongs to the detailed Functions section. These original exercises stay at introductory level. Documentation uses the 1.0.0 route; executable compatibility targets 1.0.5.

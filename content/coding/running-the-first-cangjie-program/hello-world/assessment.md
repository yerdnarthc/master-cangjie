# Assessment specification

## Identity and revision

- Problem ID: `running-the-first-cangjie-program/hello-world`
- Topic: Running the First Cangjie Program
- Problem slug: `hello-world`
- Assessment revision: 1
- Readiness: Complete; runtime verified and learner-facing content approved.
- Toolchain: Cangjie LTS 1.0.5

## Assessment intent

The learner runs the supplied complete console program and observes the greeting. The starter and reference are intentionally identical: writing source is not required for this introductory item.

## Execution contract

Compile and run the complete source as a console program. Supply the exact bytes in the input file and compare standard output with the expected output file. The input is zero bytes; the expected output is UTF-8 `Hello, World!` followed by a single LF byte.

## Test inventory

| Case ID | Visibility | Input file | Expected-output file | Coverage purpose | Used as sample |
| --- | --- | --- | --- | --- | --- |
| case-01 | Visible | `tests/case-01.in` | `tests/case-01.out` | The required greeting and line ending with no input. | Yes |

## Scoring rationale

One test is worth 10 points. A passing batch earns 10/10; a failing case earns 0/10. The topic contains this one problem. An individual run gives feedback but does not award points; a passing topic submission completes the topic under the product rules.

## Structural requirements

None. The assessment checks the observable output and does not require a particular source structure.

## Reference-solution verification

On 2026-11-01, `tools/evaluator/content-check.py` verified copies of the actual starter, reference and case files on the existing Linux/gVisor evaluator. Both programs compiled and exited successfully with Cangjie Compiler 1.0.5 (cjnative), produced exactly the expected 14 stdout bytes, and had confirmed cleanup.

- Local report: `content-check-cb61f15a850948a191eb77aa8ebf4192.json` in the evaluator's ignored `results/` directory.
- Starter/reference SHA-256: `99b35e5975070d4ac99bfcf345bee922fc4b3e999adb0a0f08f0d64d5ec85d6f`.
- Expected/actual output SHA-256: `c98c24b677eff44860afea6f493bbaec5bb1c4cbb209c6fc2bbb47f66ff2ad31`.
- Image ID: `sha256:77cf9faa236790dbd636cb41c93c62f3b1a12c3e5e5630b3892eee9ba15b0534`.

A separate disposable copy with its expected final newline removed was rejected with a byte mismatch and nonzero checker exit. Control report: `content-check-b8bc0a76c61e4d75ba0cc8dadc3f51a0.json`. This is checker sensitivity evidence; the authored case retains its required newline.

## Incorrect-solution checks

The case detects missing output, different capitalization or punctuation, extra output, and a missing or different final newline. It does not establish how the output was produced.

## Review and publication

Content preparation is complete for assessment revision 1. Runtime verification passed as recorded above, and the maintainer approved the learner-facing content on 2026-11-01. The content is ready for integration and publication through the application's content workflow.

Integrated submission, scoring and progression behavior require their own implementation verification. Future scoring-affecting corrections require a new assessment revision and the established correction policy.

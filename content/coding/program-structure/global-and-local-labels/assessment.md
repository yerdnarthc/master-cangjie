# Assessment specification

## Identity and revision

- Problem ID: `program-structure/global-and-local-labels`
- Category: Basic Concepts
- Topic: Program Structure
- Problem slug: `global-and-local-labels`
- Assessment revision: 1
- Readiness: Complete; reviewed, verified and approved.
- Toolchain: Cangjie LTS 1.0.5

## Assessment intent

Practice the relationship between a top-level binding and a local binding with the same name. The reference follows the suggested approach. Behavioral success demonstrates the specified output, not proof of the declarations or scope used to produce it.

## Execution contract

Compile the complete console source, run with zero-byte standard input, and compare standard output byte for byte against the UTF-8 expected-output file. Require successful execution. Each output line ends with LF, including the last.

## Test inventory

| Case ID | Visibility | Input file | Expected-output file | Coverage purpose | Used as sample |
| --- | --- | --- | --- | --- | --- |
| case-01 | Visible | `tests/case-01.in` | `tests/case-01.out` | All required lines and their order/format. | Yes |

## Scoring rationale

One test, maximum 10 points; a successful batch earns 10/10 and a failed case earns 0/10. The three topic problems have equal weight: 30 possible topic points, passing at 20/30 or 30/30 under the existing 60% rule. Individual runs award no points. Duplicate empty-input cases would not add coverage.

## Structural requirements

None configured. Suggested declarations and scope usage are practice guidance. If these become mandatory for points, design supported structural rules and reliable analysis, publish the matching instructions, and create a new assessment revision before using the gate.

## Reference-solution verification

On 2026-11-01, copies of the actual reference and starter were compiled and executed with the maintained sandbox runner and Cangjie Compiler 1.0.5. The reference exited successfully and matched case-01 byte for byte. The starter exited successfully with empty stdout, correctly failing the required output. Cleanup was confirmed for both runs.

Local evidence report: `program-structure-authoring-2f409c4042cf4c3381e2fd35cbd37082.json` in the evaluator's ignored `results/` directory; it records source/output hashes and exact per-run report references. These were explicit authoring checks using `runner.py`, not a passing run of `content-check.py`, which currently assumes passing starters.

## Incorrect-solution checks

The expected output distinguishes these representative mistakes: Printing the outer label twice, printing only the local label, reversing the two lines or extra output. Output tests cannot reject a hardcoded correct transcript or prove let/var usage or shadowing. No incorrect-source runs have yet been recorded.

## Review and publication

Content preparation is complete for assessment revision 1. The maintainer confirmed that all Program Structure content is reviewed, verified and approved on 2026-11-01, including wording, test count, equal weighting and the absence of structural gates. Runtime evidence is recorded above. The content is ready for integration and publication through the application's content workflow. Preserve historical outcomes under the established content-correction policy.

## Source alignment

Based on the official [Program Structure chapter](https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/basic_programming_concepts/program_structure.html) linked from the product's User Manual. The manual URL uses the 1.0.0 documentation route; executable compatibility must be checked with the product's pinned 1.0.5 compiler. The scenarios and expected transcripts are original exercises.

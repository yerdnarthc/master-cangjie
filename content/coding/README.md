# Coding assessment content

Topic directories follow the coding topics in the
[product roadmap](../../docs/product.md#mvp-scope).
The first topic contains the completed, runtime-verified and approved
[Hello, World! problem](running-the-first-cangjie-program/hello-world/problem.md).
The [Program Structure topic](program-structure/README.md) contains three completed,
reviewed, verified and approved coding problems.
The [Expressions topic](expressions/README.md) contains six completed, verified and
approved problems with 36 test cases.
The [introductory Functions topic](functions/README.md) contains three completed, verified
and approved problems with 12 test cases.

## Problem-writing guidance

For newly designed topics, aim for roughly 25% of problem items to have a short,
creative title and description built around a story, a real-life application or
a relatable scenario. Pair an inviting, scenario-specific title with the narrative
so learners encounter the setting in the problem list as well as the statement.
Prefer familiar language over technical construct names in these titles; keep
the learning objective and implementation requirements precise in the statement.
Count problem items, not test cases. Treat this as an approximate editorial target;
use judgment for small topics rather than adding problems just to meet a quota.

Keep each scenario relevant to the concept and suitable for beginners. Follow the
story with explicit task, input, output and constraint rules so the learner can
identify exactly what to implement. The narrative must not introduce unstated
assumptions, extra prerequisites or ambiguity in expected results. Use direct
descriptions for the remaining items. This preference applies to future authoring;
previously approved content does not require a narrative rewrite.

## Organization

```text
content/coding/
  _template/
    problem.md
    assessment.md
    starter.cj
    reference.cj
    tests/
  running-the-first-cangjie-program/
  program-structure/
  expressions/
  functions/
  basic-operators/
  integer/
  floating-point/
  boolean/
  character/
  string/
  tuple/
  array/
  range/
```

When a problem is approved for drafting, copy `_template/` into
`<topic-slug>/<problem-slug>/`. Each problem has its own directory. The template
is an authoring aid and must not be imported as curriculum content. `.gitkeep`
files retain empty directories in Git; they are not test cases.

Identifiers, Unit, Nothing and the first two onboarding topics use multiple-choice
assessments and are outside this coding-only scaffold. Topic order and release
requirements remain owned by the product specification.

## File responsibilities

| File | Purpose |
| --- | --- |
| `problem.md` | Learner-facing title, objective, instructions, constraints, input/output format, sample explanations and optional structural requirements. |
| `assessment.md` | Maintainer-facing identity/revision, test inventory and visibility, coverage rationale, scoring weight, structural-rule specification and verification evidence. |
| `starter.cj` | Initial learner source. |
| `reference.cj` | Reference solution, verified before publication. |
| `tests/` | Exact input/output files, conventionally `case-01.in` and `case-01.out`. |

The template's empty `.cj` files are placeholders, not runnable programs.
An empty-input test must have an explicit empty
`.in` file; a missing file does not mean empty input.

Test files will be authoritative for exact input/output bytes, including final
newlines. Sample descriptions should refer to visible case IDs rather than create
an independently maintained set of expected outputs. Sample counts depend on the
problem; the approved Hello World activity retains its single-test requirement.

Structural requirements are optional per problem. The template reserves space for
them without choosing a rule vocabulary or analyzer. Apply the approved gate in
the [product rules](../../docs/product.md) and
[domain model](../../docs/domain-model.md#alg-02-evaluate-coding-work-and-compute-a-problem-score).

Reference solutions, maintainer notes and hidden-test data are not learner-facing
content. Future publication/import code must explicitly select permitted fields;
this directory does not define an import schema or implement publication.

## Verification

The maintained [content checker](../../tools/evaluator/README.md#verify-coding-content)
automates compilation and exact-output comparison for a problem with runnable
starter and reference programs. Run it on the existing Linux evaluator host.
Record the printed report reference in the problem's assessment specification;
content review and publication approval remain separate from execution evidence.

# Coding assessment content

Topic directories follow the coding topics in the
[product roadmap](../../docs/product.md#mvp-scope).
The first topic contains the completed, runtime-verified and approved
[Hello, World! problem](running-the-first-cangjie-program/hello-world/problem.md).
The [Program Structure topic](program-structure/README.md) contains three completed,
reviewed, verified and approved coding problems.

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

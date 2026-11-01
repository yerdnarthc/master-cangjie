# Functions (introductory)

Category: Basic Concepts. Follows Expressions and precedes Basic Operators in the
next category. All three problems are complete, runtime verified, reviewed and approved
by the maintainer as of 2026-11-01.

| Suggested order | Problem | Focus | Cases | Points |
| --- | --- | --- | --- | --- |
| 1 | [Return a Message](return-a-message/problem.md) | No parameters; return a value and print the call result | 1 | 10 |
| 2 | [Snacks for the Moon Crew](moon-crew-snacks/problem.md) | One typed parameter and a computed return | 5 | 50 |
| 3 | [Subtract Two Values](subtract-two-values/problem.md) | Two typed parameters and argument order | 6 | 60 |

One of three items uses a creative title and story, approximately meeting the
25% editorial target without adding an unnecessary fourth exercise.

The [Basic Concepts introduction](https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/basic_programming_concepts/function.html)
briefly introduces function definitions. A separate later Functions section starts
with [Function Definition](https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/function/define_functions.html)
and covers detailed calling rules, function types, nested functions, lambdas,
closures and overloading. This topic limits itself to func, simple typed
parameters, explicit return types, return values and basic positional calls.

No recursion, advanced parameters, custom types or higher-order functions are
needed. The multiplication and subtraction are simple computations used to make
the returned value observable. Starters supply input parsing and helper outlines;
the learner completes the helper and adds a call/output in main.

There are 12 distinct cases: one visible fixed-output warm-up; then three visible
samples and two hidden cases for the single-input task; and three visible samples
and three hidden cases for the two-input task. The 10/50/60 weighting is intentional:
the warm-up contributes little, and operand-order/sign coverage adds one case to
the final problem. The total is 120 points; passing requires at least 80/120 under
the existing 60% policy. Passing does not require every problem to be solved.

Suggested helpers are not structural scoring gates. Tests establish output
behavior, not use of a function. Mandatory helper definitions/calls require
supported analysis and a revised public assessment contract before enforcement.
The current content checker assumes passing starters; these deliberately
incomplete starters instead produce no output. Each assessment records authoring
verification separately. Problem order is guidance, not an access restriction.

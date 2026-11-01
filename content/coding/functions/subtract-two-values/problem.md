# Subtract Two Values

## Learning objective

Define a function with two typed parameters, pass arguments in order and return a result.

## Prerequisites

Complete Expressions. Read the introductory Functions lesson on func, parameters, return types, return and a basic positional call. The starter supplies any input parsing needed; you can use it unchanged.

## Problem description and instructions

Read integers a and b on separate lines. Print a minus b. The order matters: subtract the second input from the first, rather than returning an absolute difference.

### Suggested approach

Try defining func difference(first: Int64, second: Int64): Int64 and returning first - second. Call difference(a, b) in main and print its returned value.

The starter includes a helper outline and main. A helper's return sends a value to its caller; printing displays that value. The suggested helper is practice guidance; equivalent behavior is accepted.

## Input format

Two integers a and b, on separate lines.

## Output format

Print only the required result on one line, followed by a single LF newline. Do not print prompts or extra blank lines.

## Constraints

-100 <= a,b <= 100. Integer inputs, when present, are decimal, have no leading/trailing spaces and end with LF. All supplied inputs are valid. No loops or advanced function features are needed.

## Sample test cases

### case-01

Input:

```text
7
2
```

Output:

```text
5
```

This case checks first input larger.

### case-02

Input:

```text
2
7
```

Output:

```text
-5
```

This case checks argument order matters.

### case-03

Input:

```text
5
5
```

Output:

```text
0
```

This case checks equal inputs.

## Structural requirements

None configured. The suggested function name, signature, return form and call are not enforced as scoring gates. Output tests cannot prove that the helper was used.

# Skip Some, Stop Early

## Learning objective

Practice break and continue through input-dependent output.

## Prerequisites

Complete Program Structure. Read the Expressions lesson for this construct. The starter supplies console input and integer conversion; valid input is guaranteed. Basic comparison, arithmetic, assignment and range notation used in the suggested approach should be introduced in the lesson with a short example.

## Problem description and instructions

Visit integers from 1 through n in increasing order. Stop the entire process before printing the first multiple of 7. Skip each multiple of 3 and continue with the next number. Print every other visited number on its own line. After processing stops or the interval ends, print Done.

### Suggested approach

Practice break and continue. Preserve the supplied input-reading code and add your computation/output inside main. This approach is guidance; equivalent solutions with the same behavior are accepted.

## Input format and constraints

One integer n on one line; 1 <= n <= 30. Input lines contain decimal integers without leading/trailing spaces and end with LF. There are no malformed or out-of-range test inputs.

## Output format

The eligible numbers in increasing order, followed by Done. End every output line with LF, including the final line. Print no prompts, labels beyond those specified, or extra blank lines.

## Sample test cases

### case-01

Input:

```text
1
```

Output:

```text
1
Done
```

This case checks single eligible number.

### case-02

Input:

```text
3
```

Output:

```text
1
2
Done
```

This case checks first skipped number.

### case-03

Input:

```text
7
```

Output:

```text
1
2
4
5
Done
```

This case checks first stopping number.

## Structural requirements

None. The assessment checks successful execution and output; it does not enforce the suggested conditional or loop construct.

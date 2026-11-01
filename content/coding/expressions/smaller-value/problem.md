# Select the Smaller Value

## Learning objective

Practice if as a value through input-dependent output.

## Prerequisites

Complete Program Structure. Read the Expressions lesson for this construct. The starter supplies console input and integer conversion; valid input is guaranteed. Basic comparison, arithmetic, assignment and range notation used in the suggested approach should be introduced in the lesson with a short example.

## Problem description and instructions

Read two integers a and b, on separate lines. Print the smaller value. If they are equal, print that shared value once.

### Suggested approach

Practice if as a value. Preserve the supplied input-reading code and add your computation/output inside main. This approach is guidance; equivalent solutions with the same behavior are accepted.

## Input format and constraints

Two integers a and b on separate lines; -100 <= a,b <= 100. Input lines contain decimal integers without leading/trailing spaces and end with LF. There are no malformed or out-of-range test inputs.

## Output format

The smaller integer. End every output line with LF, including the final line. Print no prompts, labels beyond those specified, or extra blank lines.

## Sample test cases

### case-01

Input:

```text
-10
4
```

Output:

```text
-10
```

This case checks first smaller, mixed signs.

### case-02

Input:

```text
4
-10
```

Output:

```text
-10
```

This case checks second smaller, mixed signs.

### case-03

Input:

```text
7
7
```

Output:

```text
7
```

This case checks equal values.

## Structural requirements

None. The assessment checks successful execution and output; it does not enforce the suggested conditional or loop construct.

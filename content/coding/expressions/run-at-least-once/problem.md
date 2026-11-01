# Run the Counter at Least Once

## Learning objective

Practice do-while through input-dependent output.

## Prerequisites

Complete Program Structure. Read the Expressions lesson for this construct. The starter supplies console input and integer conversion; valid input is guaranteed. Basic comparison, arithmetic, assignment and range notation used in the suggested approach should be introduced in the lesson with a short example.

## Problem description and instructions

Read n. Print the current value, then decrease it by one. Repeat while the decreased value is greater than zero. The first value must always be printed, even when n is zero or negative.

### Suggested approach

Practice do-while. Preserve the supplied input-reading code and add your computation/output inside main. This approach is guidance; equivalent solutions with the same behavior are accepted.

## Input format and constraints

One integer n on one line; -2 <= n <= 20. Input lines contain decimal integers without leading/trailing spaces and end with LF. There are no malformed or out-of-range test inputs.

## Output format

The visited counter values, one per line. For n <= 0, print n once. End every output line with LF, including the final line. Print no prompts, labels beyond those specified, or extra blank lines.

## Sample test cases

### case-01

Input:

```text
0
```

Output:

```text
0
```

This case checks initial condition would be false.

### case-02

Input:

```text
1
```

Output:

```text
1
```

This case checks exactly one positive iteration.

### case-03

Input:

```text
5
```

Output:

```text
5
4
3
2
1
```

This case checks multiple iterations.

## Structural requirements

None. The assessment checks successful execution and output; it does not enforce the suggested conditional or loop construct.

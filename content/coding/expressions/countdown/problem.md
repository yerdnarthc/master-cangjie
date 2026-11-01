# Countdown to the Stars

## Learning objective

Practice while through input-dependent output.

## Prerequisites

Complete Program Structure. Read the Expressions lesson for this construct. The starter supplies console input and integer conversion; valid input is guaranteed. Basic comparison, arithmetic, assignment and range notation used in the suggested approach should be introduced in the lesson with a short example.

## Problem description and instructions

The planetarium's star projector is about to reveal tonight's sky. Its control
panel needs a countdown display so the presenter knows when the preparation
sequence has finished. Your task is to generate the display's transcript, ending
with the panel's completion message, Done.

If preparation is already complete, the panel should show Done immediately.
Generate the lines in sequence; no real-time waiting is needed.

Read n. Print the integers from n down to 1, each on its own line, then print Done. If n is zero, print only Done.

### Suggested approach

Practice while. Preserve the supplied input-reading code and add your computation/output inside main. This approach is guidance; equivalent solutions with the same behavior are accepted.

## Input format and constraints

One integer n on one line; 0 <= n <= 20. Input lines contain decimal integers without leading/trailing spaces and end with LF. There are no malformed or out-of-range test inputs.

## Output format

Descending positive integers followed by Done on its own line. End every output line with LF, including the final line. Print no prompts, labels beyond those specified, or extra blank lines.

## Sample test cases

### case-01

Input:

```text
0
```

Output:

```text
Done
```

This case checks zero iterations.

### case-02

Input:

```text
1
```

Output:

```text
1
Done
```

This case checks single iteration.

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
Done
```

This case checks ordinary descending sequence.

## Structural requirements

None. The assessment checks successful execution and output; it does not enforce the suggested conditional or loop construct.

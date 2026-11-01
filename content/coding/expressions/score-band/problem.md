# Find Your Robot Crew

## Learning objective

Practice if / else if / else through input-dependent output.

## Prerequisites

Complete Program Structure. Read the Expressions lesson for this construct. The starter supplies console input and integer conversion; valid input is guaranteed. Basic comparison, arithmetic, assignment and range notation used in the suggested approach should be introduced in the lesson with a short example.

## Problem description and instructions

A neighborhood makerspace is preparing its next robot-building workshop. Before
joining, each participant takes a short practice quiz. Mira, the workshop mentor,
wants the registration screen to show which preparation group a participant
belongs to, so everyone gets a suitable starting activity.

Your program will turn a participant's quiz score into the group label shown on
that screen.

Read a score n from 0 through 100. Print Foundation for scores below 60, Developing for scores from 60 through 79, and Ready for scores from 80 through 100.

### Suggested approach

Practice if / else if / else. Preserve the supplied input-reading code and add your computation/output inside main. This approach is guidance; equivalent solutions with the same behavior are accepted.

## Input format and constraints

One integer n on one line; 0 <= n <= 100. Input lines contain decimal integers without leading/trailing spaces and end with LF. There are no malformed or out-of-range test inputs.

## Output format

One of Foundation, Developing or Ready. End every output line with LF, including the final line. Print no prompts, labels beyond those specified, or extra blank lines.

## Sample test cases

### case-01

Input:

```text
0
```

Output:

```text
Foundation
```

This case checks minimum, first branch.

### case-02

Input:

```text
60
```

Output:

```text
Developing
```

This case checks lower Developing boundary.

### case-03

Input:

```text
80
```

Output:

```text
Ready
```

This case checks lower Ready boundary.

## Structural requirements

None. The assessment checks successful execution and output; it does not enforce the suggested conditional or loop construct.

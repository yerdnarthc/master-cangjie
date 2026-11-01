# Snacks for the Moon Crew

## Learning objective

Define a function with one typed parameter and return its computed result.

## Prerequisites

Complete Expressions. Read the introductory Functions lesson on func, parameters, return types, return and a basic positional call. The starter supplies any input parsing needed; you can use it unchanged.

## Problem description and instructions

Luna is packing snack pouches for a crew heading to a picnic on the Moon. Each crew member gets exactly two pouches. Help her pack the right number before the shuttle doors close!

Read the number of crew members n and print the total number of pouches, calculated as 2 times n. If there are no crew members, print 0.

### Suggested approach

Try defining func pouchCount(crew: Int64): Int64 and returning crew * 2. Pass n as the argument from main, then print the returned value.

The starter includes a helper outline and main. A helper's return sends a value to its caller; printing displays that value. The suggested helper is practice guidance; equivalent behavior is accepted.

## Input format

One integer n on one line.

## Output format

Print only the required result on one line, followed by a single LF newline. Do not print prompts or extra blank lines.

## Constraints

0 <= n <= 100. Integer inputs, when present, are decimal, have no leading/trailing spaces and end with LF. All supplied inputs are valid. No loops or advanced function features are needed.

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

This case checks zero crew.

### case-02

Input:

```text
1
```

Output:

```text
2
```

This case checks single crew member.

### case-03

Input:

```text
4
```

Output:

```text
8
```

This case checks ordinary group.

## Structural requirements

None configured. The suggested function name, signature, return form and call are not enforced as scoring gates. Output tests cannot prove that the helper was used.

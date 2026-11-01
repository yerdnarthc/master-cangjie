# Global and Local Labels

## Learning objective

Practice the relationship between a top-level binding and a local binding with the same name.

## Prerequisites

Complete the Getting Started with Cangjie onboarding and the Identifiers topic. Read the Program Structure lesson sections on the entry point, variables and scope before using the suggested approach.

## Problem description and instructions

Complete the program so it prints MasterCangjie on the first line and Practice session on the second line. The starter includes a top-level label binding. Use the suggested approach below to explore how a local binding can shadow that name.

### Suggested approach

Inside main, print label before declaring a local let binding also named label. Initialize the local binding to "Practice session", then print label again. The first use refers to the top-level binding; the later use refers to the local one.

## Input format

The program receives no input.

## Output format

Print exactly the lines in case-01 below, with one LF newline after each line, including the last. Do not add prompts, blank lines or quotation marks.

## Constraints

All displayed text is fixed. No input processing is needed.

## Sample test case

**case-01:** The input is empty. Expected output:

```text
MasterCangjie
Practice session
```

This is the single assessment case. It checks all required output lines together.

## Structural requirements

None. The suggested approach explains the concept to practice; grading checks the output and successful execution. No particular variable name or declaration form is enforced by a structural gate.

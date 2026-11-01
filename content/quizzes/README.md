# Multiple-Choice Assessment Content

This directory contains the authoritative, source-linked multiple-choice activity assessments
for MasterCangjie's non-coding topics.

## Topic Assessments Inventory

| Topic ID | Title | Questions | Max Score | Passing Threshold | Readiness |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `getting-started-with-cangjie` | Getting Started with Cangjie | 10 | 100 | 60/100 (6/10) | Approved, authored |
| `installing-the-cangjie-toolchain` | Installing the Cangjie Toolchain | 10 | 100 | 60/100 (6/10) | Approved, authored |

## Format Specification

Each topic directory contains `activity.json` conforming to the domain model:
- `topicId`: Matching canonical topic ID in the roadmap.
- `revision`: Integer (starting at 1).
- `title`: Display title of the activity.
- `questions`: Exactly 10 questions (`q01`–`q10`), each having:
  - `id`: Question ID.
  - `prompt`: Question text written in the patient Cangjie tutor voice.
  - `choices`: Array of answer choices with unique IDs (`a`, `b`, `c`, `d`).
  - `correctChoiceId`: The single correct choice ID (server-side only; hidden from public projections before submission).
  - `explanation`: Tutor explanation provided upon feedback review.

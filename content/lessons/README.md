# Lesson handout content

Lesson prose lives in version-controlled Markdown files under
`content/lessons/<topicId>/`. Each topic folder has a `topic.json`, an
`introduction.md`, a `summary.md`, and one Markdown file for each listed lesson
section. Roadmap owns loading and rendering these files. This content store adds
no lesson database schema, CMS, or authoring interface.

## Current handouts

| Category | Topic ID | Activity |
| --- | --- | --- |
| Getting Started with Cangjie | `getting-started-with-cangjie` | Multiple-choice quiz |
| Getting Started with Cangjie | `installing-the-cangjie-toolchain` | Multiple-choice quiz |
| Getting Started with Cangjie | `running-the-first-cangjie-program` | Coding activity |
| Basic Concepts | `identifiers` | Multiple-choice quiz |
| Basic Concepts | `program-structure` | Coding activity |
| Basic Concepts | `expressions` | Coding activity |
| Basic Concepts | `functions` | Coding activity |

`position` in `topic.json` is the zero-based global roadmap order and matches
`topics.position` in PostgreSQL. Categories group topics; progression follows
the global topic order.

## Topic files

```text
content/lessons/<topicId>/
  topic.json
  introduction.md
  summary.md
  sections/
    <sectionId>.md
```

`topic.json` stores the topic ID and title, category ID and title, position,
activity kind (`quiz` or `coding`), ordered section IDs and titles, and source
labels and URLs. Section IDs also provide the lesson navigation anchors. Put
each section body in the matching `sections/<sectionId>.md` file; the adapter
uses the order in `topic.json` when it builds the handout.

The introduction, sections, and summary are Markdown. Keep code examples in
fenced blocks and preserve commands, output, language versions, scoring rules,
and source links when editing a lesson. Write learner-facing copy in the
patient Cangjie tutor voice described in [`docs/content-style.md`](../../docs/content-style.md).

## Loading and validation

`FileLessonContent` in `modules/roadmap/adapters/lesson-content.ts` reads the
files on the server through `apps/web/src/bootstrap/roadmap.ts`. It checks safe
topic and section IDs, matching directory and metadata IDs, required metadata,
supported activity kinds, unique section IDs and topic positions, valid HTTP(S)
source URLs, and non-empty required Markdown files. An unknown topic returns
`undefined`; malformed metadata or a missing, unreadable, or empty required
file raises an error instead of returning a partial handout.

Adding a handout means adding its topic folder and metadata, then adding every
listed Markdown file. Keep `topic.json` and the database topic inventory
aligned. The activity kind selects the quiz or coding route; activity content
continues to live in `content/quizzes/` and `content/coding/`.

## Learner access and progression

Files define published topic content, not a learner's permission to read it.
Topic Submission owns the persisted availability, completion, and prerequisite
state. The roadmap shows a locked topic's title, locked status, and immediate
prerequisite guidance. Lesson and activity routes check availability before
loading lesson Markdown or rendering an activity workspace. Direct links to a
locked topic show the prerequisite guidance without lesson text, summaries,
sources, or activity content. Reading a handout does not award a score or
complete a topic.

The first topic is initially available. Later topics become available only
through the existing completion rules. A passed multiple-choice topic remains
available and appears as awaiting completion until the learner selects
“Mark complete.” Coding topics complete through their passing finalized
submission. Persistent resume location is a separate feature and is not part
of this storage change.

Sources were checked on 2026-11-02. The official 1.0.0 introductory guide
supplies the basic language and local workflow; the platform remains pinned to
1.0.5 LTS, whose download page is linked separately. OS-specific requirements
belong to the versioned official installation guide. The lesson's Hello World
example matches the existing assessment, which deliberately uses a different
greeting from the official introductory example.

RISK-04 remains open. A file-based content layout and route enforcement do not
by themselves establish that the complete curriculum is correct or ready for
release.

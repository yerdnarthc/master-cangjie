# Onboarding handouts

The three approved onboarding handouts are maintained as structured content in
`modules/roadmap/application/onboarding.ts`. Shared topic rendering is owned by
Roadmap; there is no lesson database schema or CMS in this slice.

Sources were checked on 2026-11-02. Each handout links its official sources.
The official 1.0.0 introductory guide supplies the basic language/local workflow;
the platform remains pinned to 1.0.5 LTS, whose download page is linked separately.
OS-specific requirements belong to the versioned official installation guide.
The lesson's Hello World example matches the existing assessment, which deliberately
uses a different greeting from the official introductory example.

Topic pages at `/topics/<topicId>` are public lesson previews during the internal
build. They do not claim learner unlocks or create completion evidence. The first
two ten-question quizzes, real onboarding progression/access enforcement (UC-05),
and persistent resume location are still pending future implementation. Only the
existing Hello World activity is enabled, at
`/topics/running-the-first-cangjie-program/activity`; its APIs retain their current
authentication and availability checks. Visiting a handout never marks code attempted.
Basic Concepts is outside this slice.

import Link from "next/link";
import Markdown from "react-markdown";
import type { Lesson, TopicMetadata } from "../../../../modules/roadmap/application/onboarding.ts";
import ThemeModeToggle from "./theme-mode-toggle";

export default function TopicLesson({
  lesson,
  catalog,
}: {
  lesson: Lesson;
  catalog: TopicMetadata[];
}) {
  const globalPosition = catalog.findIndex((topic) => topic.id === lesson.id);
  const categoryLessons = catalog.filter((topic) => topic.categoryId === lesson.categoryId);
  const categoryPosition = categoryLessons.findIndex((topic) => topic.id === lesson.id);
  const categoryIndex = [...new Set(catalog.map((topic) => topic.categoryId))].indexOf(lesson.categoryId);
  const previous = catalog[globalPosition - 1];
  const next = catalog[globalPosition + 1];

  return (
    <div className={`workspace-shell lesson-shell lesson-page lesson-page--category-${categoryIndex % 4}`}>
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
        <span className="muted">{lesson.categoryTitle}</span>
        <ThemeModeToggle />
      </header>
      <main id="lesson-main">
        <h1>{lesson.title}</h1>
        <p className="lesson-position">
          {lesson.categoryTitle} <span aria-hidden="true">/</span> Topic {categoryPosition + 1} of {categoryLessons.length}
        </p>
        <div className="lesson-introduction">
          <Markdown>{lesson.introduction}</Markdown>
        </div>
        <div className="lesson-columns">
          <aside className="panel lesson-navigation">
            <nav aria-label={`${lesson.categoryTitle} topics`}>
              <h2>In this category</h2>
              <ol>
                {categoryLessons.map((topic) => (
                  <li key={topic.id}>
                    <Link
                      href={`/topics/${topic.id}`}
                      aria-current={topic.id === lesson.id ? "page" : undefined}
                    >
                      {topic.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
            <nav aria-label="On this page">
              <h2>On this page</h2>
              <ul>
                {lesson.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.title}</a>
                  </li>
                ))}
                <li>
                  <a href="#summary">Summary</a>
                </li>
                <li>
                  <a href="#activity">Activity</a>
                </li>
              </ul>
            </nav>
          </aside>
          <div className="lesson-body">
            <article className="panel" aria-label="Lesson handout">
              {lesson.sections.map((section) => (
                <section id={section.id} key={section.id}>
                  <h2>{section.title}</h2>
                  <Markdown>{section.body}</Markdown>
                </section>
              ))}
              <section id="summary">
                <h2>Summary</h2>
                <Markdown>{lesson.summary}</Markdown>
              </section>
              <footer className="lesson-sources">
                <h2>Further reading</h2>
                <p>
                  Based on the official language documentation. MasterCangjie
                  exercises use Cangjie 1.0.5.
                </p>
                <ul>
                  {lesson.sources.map((source) => (
                    <li key={source.href}>
                      <a href={source.href}>{source.label}</a>
                    </li>
                  ))}
                </ul>
              </footer>
            </article>
            <section
              id="activity"
              className="panel"
              aria-labelledby="activity-heading"
            >
              <h2 id="activity-heading">
                {lesson.activity === "coding"
                  ? lesson.id === "running-the-first-cangjie-program"
                    ? "Hello World coding activity"
                    : "Coding activity"
                  : "Multiple-choice activity"}
              </h2>
              {lesson.activity === "coding" ? (
                <>
                  <p>
                    {lesson.id === "running-the-first-cangjie-program"
                      ? "Practice with the browser editor and the existing one-test Hello World assessment."
                      : "Practice with interactive coding problems in the browser editor."}
                  </p>
                  <Link
                    className="activity-link"
                    href={`/topics/${lesson.id}/activity`}
                  >
                    {lesson.id === "running-the-first-cangjie-program"
                      ? "Open Hello World activity"
                      : "Open coding activity"}
                  </Link>
                </>
              ) : (
                <>
                  <p>
                    Test your understanding with a 10-question multiple-choice
                    activity.
                  </p>
                  <Link
                    className="activity-link"
                    href={`/topics/${lesson.id}/activity`}
                  >
                    Start multiple-choice activity
                  </Link>
                  <p className="muted">
                    Passing requires at least 60/100 and then selecting Mark
                    complete.
                  </p>
                </>
              )}
              <p className="muted">
                Reading a lesson does not award a score or complete a topic.
              </p>
            </section>
            <nav
              className="lesson-pagination panel"
              aria-label="Lesson navigation"
            >
              {previous && (
                <Link href={`/topics/${previous.id}`}>
                  Previous lesson: {previous.title}
                </Link>
              )}
              {next && (
                <Link href={`/topics/${next.id}`}>
                  Next lesson: {next.title}
                </Link>
              )}
            </nav>
          </div>
        </div>
      </main>
    </div>
  );
}

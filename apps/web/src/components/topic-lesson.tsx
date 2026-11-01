import Link from "next/link";
import Markdown from "react-markdown";
import {
  onboarding,
  type Lesson,
} from "../../../../modules/roadmap/application/onboarding.ts";
export default function TopicLesson({ lesson }: { lesson: Lesson }) {
  const position = onboarding.findIndex((topic) => topic.id === lesson.id);
  const previous = onboarding[position - 1],
    next = onboarding[position + 1];
  return (
    <div className="workspace-shell lesson-shell">
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
        <span className="muted">Getting Started with Cangjie</span>
      </header>
      <main id="lesson-main">
        <p className="eyebrow">
          Onboarding / Topic {position + 1} of {onboarding.length}
        </p>
        <h1>{lesson.title}</h1>
        <p className="lesson-introduction">{lesson.introduction}</p>
        <div className="lesson-columns">
          <aside className="panel lesson-navigation">
            <nav aria-label="Onboarding topics">
              <h2>In this category</h2>
              <ol>
                {onboarding.map((topic) => (
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
                <ul>
                  {lesson.summary.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
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
              <p className="eyebrow">Put it into practice</p>
              <h2 id="activity-heading">
                {lesson.activity === "coding"
                  ? "Hello World coding activity"
                  : "Multiple-choice activity"}
              </h2>
              {lesson.activity === "coding" ? (
                <>
                  <p>
                    Practice with the browser editor and the existing one-test
                    Hello World assessment.
                  </p>
                  <Link
                    className="activity-link"
                    href={`/topics/${lesson.id}/activity`}
                  >
                    Open Hello World activity
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

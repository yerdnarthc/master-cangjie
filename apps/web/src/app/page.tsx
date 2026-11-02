import Link from "next/link";
import {
  categories,
  lessonsForCategory,
} from "../../../../modules/roadmap/application/onboarding.ts";

export default function Home() {
  return (
    <div className="workspace-shell lesson-shell">
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
      </header>
      <main>
        <p className="eyebrow">Curriculum Roadmap</p>
        <h1>Learn Cangjie</h1>
        <p>
          Master Cangjie step by step through interactive lessons, multiple-choice activities, and coding challenges.
        </p>

        {categories.map((category, catIdx) => {
          const categoryTopics = lessonsForCategory(category.id);
          return (
            <section key={category.id} style={{ marginTop: '2.5rem' }}>
              <p className="eyebrow" style={{ margin: '0 0 .3rem' }}>
                Category {catIdx + 1}
              </p>
              <h2>{category.title}</h2>
              <p className="muted" style={{ margin: '0 0 1rem' }}>
                {category.description}
              </p>
              <ol className="topic-list" style={{ margin: '1rem 0' }}>
                {categoryTopics.map((topic) => (
                  <li className="panel" key={topic.id}>
                    <h2>
                      <Link href={`/topics/${topic.id}`}>{topic.title}</Link>
                    </h2>
                    <p>{topic.introduction}</p>
                    <span className="muted">
                      {topic.activity === "coding"
                        ? "Coding activity available"
                        : "Multiple-choice activity available"}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}

        <div style={{ marginTop: '2.5rem' }}>
          <Link className="activity-link" href="/topics/getting-started-with-cangjie">
            Start the first lesson
          </Link>
        </div>
      </main>
    </div>
  );
}

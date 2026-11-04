import Link from "next/link";
import { categories } from "../../../../modules/roadmap/application/onboarding.ts";
import {
  application,
  developmentSignInAvailable,
  optionalAuthenticatedActor,
} from "../bootstrap/application";
import { lessonContent } from "../bootstrap/roadmap";
import RoadmapSignIn from "../components/roadmap-sign-in";
import ThemeModeToggle from "../components/theme-mode-toggle";

export default async function Home() {
  const metadata = await lessonContent.listMetadata();
  const actor = await optionalAuthenticatedActor();
  if (!actor) return <RoadmapSignIn developmentSignInAvailable={developmentSignInAvailable()} />;

  const access = await application.roadmapAccess(actor);
  const accessById = new Map(access.map((entry) => [entry.topicId, entry]));
  const metadataById = new Map(metadata.map((topic) => [topic.id, topic]));
  const availableTopics = metadata.filter((topic) => {
    if (!accessById.has(topic.id)) {
      throw new Error(`Roadmap access is missing for topic ${topic.id}.`);
    }
    return accessById.get(topic.id)!.available;
  });
  const availableLessons = await Promise.all(
    availableTopics.map(async ({ id }) => {
      const lesson = await lessonContent.readLesson(id);
      if (!lesson) throw new Error(`Lesson content is missing for ${id}.`);
      return [id, lesson] as const;
    }),
  );
  const lessonById = new Map(availableLessons);
  return (
    <div className="workspace-shell lesson-shell">
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
        <ThemeModeToggle />
      </header>
      <main className="roadmap-main">
        <h1>Learn Cangjie</h1>
        <p className="roadmap-introduction">
          Master Cangjie step by step through interactive lessons, multiple-choice activities, and coding challenges.
        </p>

        {categories.map((category, catIdx) => {
          const categoryTopics = metadata.filter((topic) => topic.categoryId === category.id);
          return (
            <section className={`curriculum-category curriculum-category--${catIdx % 4}`} key={category.id}>
              <h2>
                <span className="curriculum-category-index">Category {catIdx + 1}</span>
                {category.title}
              </h2>
              <p className="muted curriculum-category-description">
                {category.description}
              </p>
              <ol className="topic-list">
                {categoryTopics.map((topic) => {
                  const progress = accessById.get(topic.id)!;
                  const topicState = !progress.available
                    ? "locked"
                    : progress.completed
                      ? "completed"
                      : progress.awaitingCompletion
                        ? "awaiting"
                        : "available";
                  if (!progress.available) {
                    const prerequisiteTitle = progress.prerequisiteTopicId
                      ? metadataById.get(progress.prerequisiteTopicId)?.title ?? progress.prerequisiteTopicId
                      : null;
                    return (
                      <li className={`panel topic-card topic-card--${topicState}`} key={topic.id}>
                        <h2>{topic.title}</h2>
                        <p className={`topic-status topic-status--${topicState}`}>Locked</p>
                        {prerequisiteTitle ? (
                          <p>Complete {prerequisiteTitle} to unlock this topic.</p>
                        ) : (
                          <p>This topic is not available yet.</p>
                        )}
                      </li>
                    );
                  }

                  const lesson = lessonById.get(topic.id);
                  if (!lesson) throw new Error(`Available lesson was not loaded for ${topic.id}.`);
                  return (
                    <li className={`panel topic-card topic-card--${topicState}`} key={topic.id}>
                      <h2>
                        <Link href={`/topics/${topic.id}`}>{topic.title}</Link>
                      </h2>
                      <p className={`topic-status topic-status--${topicState}`}>
                        {progress.completed
                          ? "Completed"
                          : progress.awaitingCompletion
                            ? "Passed · Awaiting completion"
                            : "Available"}
                      </p>
                      <p>{lesson.introduction}</p>
                      <span className="muted topic-activity-kind">
                        {topic.activity === "coding"
                          ? "Coding activity available"
                          : "Multiple-choice activity available"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}

        {metadata[0] && accessById.get(metadata[0].id)?.available && (
          <div className="roadmap-start">
            <Link className="activity-link" href={`/topics/${metadata[0].id}`}>
              Start the first lesson
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

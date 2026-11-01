import { notFound } from "next/navigation";
import TopicLesson from "../../../components/topic-lesson";
import { lessonFor } from "../../../../../../modules/roadmap/application/onboarding.ts";
export default async function Topic({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const lesson = lessonFor(topicId);
  if (lesson) return <TopicLesson lesson={lesson} />;
  if (topicId === "identifiers")
    return (
      <main>
        <h1>Identifiers</h1>
        <p>
          This multiple-choice activity is not available in this internal build.
        </p>
        <a href="/topics/running-the-first-cangjie-program">
          Back to Hello World lesson
        </a>
      </main>
    );
  notFound();
}

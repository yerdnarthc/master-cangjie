import { notFound } from "next/navigation";
import CodingWorkspace from "../../../../components/coding-workspace";
import QuizWorkspace from "../../../../components/quiz-workspace";
import { lessonContent } from "../../../../bootstrap/roadmap";

export default async function Activity({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;

  const topic = await lessonContent.readMetadata(topicId);
  if (!topic) notFound();

  if (topic.activity === "quiz") {
    return (
      <QuizWorkspace
        topicId={topicId}
        topicTitle={topic.title}
        categoryTitle={topic.categoryTitle}
      />
    );
  }

  return (
    <CodingWorkspace
      topicId={topicId}
      topicTitle={topic.title}
      categoryTitle={topic.categoryTitle}
    />
  );
}

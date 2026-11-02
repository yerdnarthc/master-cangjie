import { notFound } from "next/navigation";
import TopicLesson from "../../../components/topic-lesson";
import { lessonContent } from "../../../bootstrap/roadmap";

export default async function Topic({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const [lesson, catalog] = await Promise.all([
    lessonContent.readLesson(topicId),
    lessonContent.listMetadata(),
  ]);
  if (lesson) return <TopicLesson lesson={lesson} catalog={catalog} />;
  notFound();
}

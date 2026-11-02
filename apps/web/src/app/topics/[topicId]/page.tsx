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
  notFound();
}

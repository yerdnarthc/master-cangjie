import { notFound } from "next/navigation";
import TopicLesson from "../../../components/topic-lesson";
import LockedTopic from "../../../components/locked-topic";
import RoadmapSignIn from "../../../components/roadmap-sign-in";
import {
  application,
  quizApplication,
  developmentSignInAvailable,
  optionalAuthenticatedActor,
} from "../../../bootstrap/application";
import { lessonContent } from "../../../bootstrap/roadmap";

export default async function Topic({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const topic = await lessonContent.readMetadata(topicId);
  if (!topic) notFound();

  const actor = await optionalAuthenticatedActor();
  if (!actor) return <RoadmapSignIn developmentSignInAvailable={developmentSignInAvailable()} />;
  const access = await application.roadmapAccess(actor);
  const topicAccess = access.find((entry) => entry.topicId === topicId);
  if (!topicAccess) throw new Error(`Roadmap access is missing for topic ${topicId}.`);
  if (!topicAccess.available) {
    const prerequisite = topicAccess.prerequisiteTopicId
      ? await lessonContent.readMetadata(topicAccess.prerequisiteTopicId)
      : undefined;
    return (
      <LockedTopic
        topicTitle={topic.title}
        prerequisiteTitle={prerequisite?.title ?? null}
      />
    );
  }

  const [lesson, catalog] = await Promise.all([
    lessonContent.readLesson(topicId),
    lessonContent.listMetadata(),
  ]);
  if (!lesson) throw new Error(`Lesson content is missing for ${topicId}.`);
  const quizState = topic.activity === "quiz" ? await quizApplication.activityState(actor, topicId) : undefined;
  return <TopicLesson lesson={lesson} catalog={catalog} quizState={quizState} />;
}

import { notFound } from "next/navigation";
import CodingWorkspace from "../../../../components/coding-workspace";
import LockedTopic from "../../../../components/locked-topic";
import QuizWorkspace from "../../../../components/quiz-workspace";
import RoadmapSignIn from "../../../../components/roadmap-sign-in";
import {
  application,
  developmentSignInAvailable,
  optionalAuthenticatedActor,
} from "../../../../bootstrap/application";
import { lessonContent } from "../../../../bootstrap/roadmap";

export default async function Activity({
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

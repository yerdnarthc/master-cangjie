import Link from "next/link";
import { notFound } from "next/navigation";
import {
  application,
  quizApplication,
  optionalAuthenticatedActor,
  developmentSignInAvailable,
} from "../../../../../bootstrap/application";
import { lessonContent } from "../../../../../bootstrap/roadmap";
import QuizBestReview from "../../../../../components/quiz-best-review";
import LockedTopic from "../../../../../components/locked-topic";
import RoadmapSignIn from "../../../../../components/roadmap-sign-in";
import ThemeModeToggle from "../../../../../components/theme-mode-toggle";
import { OperationError } from "../../../../../../../../modules/learner-account/application/actor.ts";
export default async function Review({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const topic = await lessonContent.readMetadata(topicId);
  if (!topic || topic.activity !== "quiz") notFound();
  const actor = await optionalAuthenticatedActor();
  if (!actor)
    return (
      <RoadmapSignIn
        developmentSignInAvailable={developmentSignInAvailable()}
      />
    );
  const access = (await application.roadmapAccess(actor)).find(
    (e) => e.topicId === topicId,
  );
  if (!access?.available) {
    const prerequisite = access?.prerequisiteTopicId
      ? await lessonContent.readMetadata(access.prerequisiteTopicId)
      : null;
    return (
      <LockedTopic
        topicTitle={topic.title}
        prerequisiteTitle={prerequisite?.title ?? null}
      />
    );
  }
  let review;
  let message = "You haven't submitted this activity yet.";
  try {
    review = await quizApplication.reviewBest(actor, topicId);
  } catch (e) {
    if (!(e instanceof OperationError) || e.status !== 503) throw e;
    message = e.message;
  }
  if (review)
    return <QuizBestReview review={review} topicTitle={topic.title} />;
  return (
    <div className="workspace-shell lesson-shell">
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
        <ThemeModeToggle />
      </header>
      <main className="entry-panel">
        <h1>Best submission</h1>
        <p role="status">{message}</p>
        <Link href={`/topics/${topicId}`}>Back to topic</Link>
      </main>
    </div>
  );
}

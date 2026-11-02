import { notFound } from "next/navigation";
import CodingWorkspace from "../../../../components/coding-workspace";
import QuizWorkspace from "../../../../components/quiz-workspace";

export default async function Activity({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;

  if (
    topicId === "getting-started-with-cangjie" ||
    topicId === "installing-the-cangjie-toolchain" ||
    topicId === "identifiers"
  ) {
    return <QuizWorkspace topicId={topicId} />;
  }

  if (
    topicId === "running-the-first-cangjie-program" ||
    topicId === "program-structure" ||
    topicId === "expressions" ||
    topicId === "functions"
  ) {
    return <CodingWorkspace topicId={topicId} />;
  }

  notFound();
}

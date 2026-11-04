import {
  quizApplication,
  authenticatedActor,
} from "../../../../../../bootstrap/application";
import { response } from "../../../../../../bootstrap/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  return response(async () =>
    quizApplication.activityState(
      await authenticatedActor(),
      (await params).topicId,
    ),
  );
}

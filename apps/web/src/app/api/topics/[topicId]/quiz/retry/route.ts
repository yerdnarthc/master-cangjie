import { quizApplication, authenticatedActor } from '../../../../../../bootstrap/application';
import { response, sameOrigin, jsonBody, stringField, numberField, uuid, requireExpectedLearner } from '../../../../../../bootstrap/http';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  return response(async () => {
    sameOrigin(request);
    const { topicId } = await params;
    const actor = await authenticatedActor();
    const body = await jsonBody(request, [
      'sourceSubmissionId',
      'expectedAttemptId',
      'baseRevision',
      'expectedLearnerId',
    ]);
    requireExpectedLearner(body, actor.learnerId);
    return quizApplication.startRetry(actor, topicId, {
      sourceSubmissionId: uuid(stringField(body, 'sourceSubmissionId')),
      expectedAttemptId: uuid(stringField(body, 'expectedAttemptId')),
      baseRevision: numberField(body, 'baseRevision'),
    });
  });
}

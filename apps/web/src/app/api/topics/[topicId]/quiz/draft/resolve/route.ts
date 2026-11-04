import { quizApplication, authenticatedActor } from '../../../../../../../bootstrap/application';
import { response, sameOrigin, jsonBody, stringField, numberField, uuid, requireExpectedLearner } from '../../../../../../../bootstrap/http';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  return response(async () => {
    sameOrigin(request);
    const { topicId } = await params;
    const actor = await authenticatedActor();
    const b = await jsonBody(request, ['attemptId', 'conflictId', 'choice', 'baseRevision', 'expectedLearnerId']);
    requireExpectedLearner(b, actor.learnerId);
    return quizApplication.resolveDraft(actor, topicId, {
      attemptId: b.attemptId === undefined ? undefined : uuid(stringField(b, 'attemptId')),
      conflictId: uuid(stringField(b, 'conflictId')),
      choice: stringField(b, 'choice') as 'server' | 'candidate',
      baseRevision: numberField(b, 'baseRevision'),
    });
  });
}

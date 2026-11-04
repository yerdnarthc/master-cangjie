import { quizApplication, authenticatedActor } from '../../../../../../bootstrap/application';
import { response, sameOrigin, jsonBody, numberField, requireExpectedLearner, stringField, uuid } from '../../../../../../bootstrap/http';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  return response(async () => {
    sameOrigin(request);
    const { topicId } = await params;
    const actor = await authenticatedActor();
    const b = await jsonBody(request, ['attemptId', 'baseRevision', 'answers', 'expectedLearnerId']);
    requireExpectedLearner(b, actor.learnerId);
    const baseRevision = numberField(b, 'baseRevision');
    const answers = (b.answers ?? {}) as Record<string, string>;
    const attemptId = b.attemptId === undefined ? undefined : uuid(stringField(b, 'attemptId'));
    return quizApplication.saveDraft(actor, topicId, { attemptId, baseRevision, answers });
  });
}

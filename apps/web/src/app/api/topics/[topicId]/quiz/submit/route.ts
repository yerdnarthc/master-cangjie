import { quizApplication, authenticatedActor } from '../../../../../../bootstrap/application';
import { response, sameOrigin, jsonBody, stringField, numberField, requireExpectedLearner } from '../../../../../../bootstrap/http';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  return response(async () => {
    sameOrigin(request);
    const { topicId } = await params;
    const actor = await authenticatedActor();
    const b = await jsonBody(request, ['requestKey', 'answers', 'assessmentRevision', 'expectedLearnerId']);
    requireExpectedLearner(b, actor.learnerId);
    const requestKey = stringField(b, 'requestKey');
    const assessmentRevision = numberField(b, 'assessmentRevision');
    const answers = (b.answers ?? {}) as Record<string, string>;
    return quizApplication.submit(actor, {
      topicId,
      requestKey,
      answers,
      assessmentRevision,
    });
  });
}

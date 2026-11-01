import { quizApplication, authenticatedActor } from '../../../../../../../bootstrap/application';
import { response, sameOrigin, jsonBody, stringField, numberField, uuid } from '../../../../../../../bootstrap/http';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  return response(async () => {
    sameOrigin(request);
    const { topicId } = await params;
    const actor = await authenticatedActor();
    const b = await jsonBody(request, ['conflictId', 'choice', 'baseRevision']);
    return quizApplication.resolveDraft(actor, topicId, {
      conflictId: uuid(stringField(b, 'conflictId')),
      choice: stringField(b, 'choice') as 'server' | 'candidate',
      baseRevision: numberField(b, 'baseRevision'),
    });
  });
}

import { quizApplication, authenticatedActor } from '../../../../../bootstrap/application';
import { response, sameOrigin } from '../../../../../bootstrap/http';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  return response(async () => {
    sameOrigin(request);
    const { topicId } = await params;
    const actor = await authenticatedActor();
    return quizApplication.markComplete(actor, topicId);
  });
}

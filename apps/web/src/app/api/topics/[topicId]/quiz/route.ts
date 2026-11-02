import { quizApplication, authenticatedActor } from '../../../../../bootstrap/application';
import { response } from '../../../../../bootstrap/http';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  return response(async () => {
    const { topicId } = await params;
    const actor = await authenticatedActor();
    return quizApplication.workspace(actor, topicId);
  });
}

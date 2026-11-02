import { application, authenticatedActor } from '../../../../../bootstrap/application';
import { response } from '../../../../../bootstrap/http';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
) {
  return response(async () => {
    const { topicId } = await params;
    const url = new URL(request.url);
    const problemId = url.searchParams.get('problem') ?? undefined;
    const actor = await authenticatedActor();
    return application.workspace(actor, topicId, problemId);
  });
}

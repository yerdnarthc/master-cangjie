import { application, authenticatedActor } from '../../../bootstrap/application';
import { response } from '../../../bootstrap/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const topicId = url.searchParams.get('topicId') ?? undefined;
  const problemId = url.searchParams.get('problemId') ?? undefined;
  return response(async () =>
    application.workspace(await authenticatedActor(), topicId, problemId),
  );
}

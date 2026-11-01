import {application,authenticatedActor} from '../../../bootstrap/application';
import {response} from '../../../bootstrap/http';
export const dynamic='force-dynamic';
export async function GET(){return response(async()=>application.workspace(await authenticatedActor()));}

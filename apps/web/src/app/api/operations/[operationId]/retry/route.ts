import {application,authenticatedActor} from '../../../../../bootstrap/application';
import {response,sameOrigin,uuid} from '../../../../../bootstrap/http';
export async function POST(request:Request,{params}:{params:Promise<{operationId:string}>}){return response(async()=>{sameOrigin(request);return application.retry(await authenticatedActor(),uuid((await params).operationId));});}

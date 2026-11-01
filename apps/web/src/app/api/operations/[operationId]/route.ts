import {application,authenticatedActor} from '../../../../bootstrap/application';
import {response,uuid} from '../../../../bootstrap/http';
export async function GET(_request:Request,{params}:{params:Promise<{operationId:string}>}){return response(async()=>application.read(await authenticatedActor(),uuid((await params).operationId)));}

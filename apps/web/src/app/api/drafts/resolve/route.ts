import {application,authenticatedActor} from '../../../../bootstrap/application';
import {response,sameOrigin,jsonBody,stringField,numberField,uuid} from '../../../../bootstrap/http';
export async function POST(request:Request){return response(async()=>{sameOrigin(request);const actor=await authenticatedActor(),b=await jsonBody(request,['conflictId','choice','baseRevision']);return application.resolve(actor,{conflictId:uuid(stringField(b,'conflictId')),choice:stringField(b,'choice') as 'server'|'candidate',baseRevision:numberField(b,'baseRevision')});});}

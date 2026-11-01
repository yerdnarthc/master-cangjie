import {application,authenticatedActor} from '../../../bootstrap/application';
import {response,sameOrigin,jsonBody,stringField,numberField} from '../../../bootstrap/http';
export async function PUT(request:Request){return response(async()=>{sameOrigin(request);const actor=await authenticatedActor(),b=await jsonBody(request,['problemId','baseRevision','source']);return application.save(actor,{problemId:stringField(b,'problemId'),baseRevision:numberField(b,'baseRevision'),source:stringField(b,'source')});});}

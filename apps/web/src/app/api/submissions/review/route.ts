import {application,authenticatedActor} from '../../../../bootstrap/application';
import {response,sameOrigin,jsonBody,stringField} from '../../../../bootstrap/http';
export async function POST(request:Request){return response(async()=>{sameOrigin(request);const actor=await authenticatedActor(),b=await jsonBody(request,['topicId']);return application.review(actor,stringField(b,'topicId'));});}

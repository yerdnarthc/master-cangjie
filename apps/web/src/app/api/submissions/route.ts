import {application,authenticatedActor} from '../../../bootstrap/application';
import {response,sameOrigin,jsonBody,stringField,uuid} from '../../../bootstrap/http';
import {OperationError} from '../../../../../../modules/learner-account/application/actor';
export async function POST(request:Request){return response(async()=>{sameOrigin(request);const actor=await authenticatedActor(),b=await jsonBody(request,['requestKey','reviewToken','acknowledgeUnattempted']);if(typeof b.acknowledgeUnattempted!=='boolean')throw new OperationError(400,'Explicit acknowledgement is required.');return application.confirm(actor,{requestKey:stringField(b,'requestKey'),reviewToken:uuid(stringField(b,'reviewToken')),acknowledgeUnattempted:b.acknowledgeUnattempted});});}

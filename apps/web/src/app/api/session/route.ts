import {cookies} from 'next/headers';
import {issueDevelopmentSession} from '../../../../../../modules/learner-account/adapters/development-session';
import {response,sameOrigin} from '../../../bootstrap/http';
export async function POST(request:Request){return response(async()=>{sameOrigin(request);const value=issueDevelopmentSession();(await cookies()).set('mcj_session',value,{httpOnly:true,sameSite:'strict',secure:new URL(request.url).protocol==='https:',path:'/',maxAge:8*60*60});return {signedIn:true};});}

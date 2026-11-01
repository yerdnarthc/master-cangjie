import {cookies} from 'next/headers';
import {response,sameOrigin} from '../../../../bootstrap/http';
export async function POST(request:Request){return response(async()=>{sameOrigin(request);(await cookies()).delete('mcj_session');return {signedOut:true};});}

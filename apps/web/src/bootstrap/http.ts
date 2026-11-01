import { NextResponse } from 'next/server';
import { OperationError } from '../../../../modules/learner-account/application/actor.ts';
export function sameOrigin(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new OperationError(403,'This action requires a same-origin request.');
}
export async function jsonBody(request:Request,allowed:string[]) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new OperationError(400,'Send a JSON request.');
  const reader=request.body?.getReader();if(!reader)throw new OperationError(400,'A request body is required.');
  const buffers:Uint8Array[]=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>300*1024){await reader.cancel();throw new OperationError(413,'Request too large.');}buffers.push(value);}} finally {reader.releaseLock();}
  let body:Record<string,unknown>;
  try {body=JSON.parse(Buffer.concat(buffers).toString('utf8'));}catch {throw new OperationError(400,'Malformed JSON.');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))throw new OperationError(400,'Unexpected request fields.');
  return body;
}
export function stringField(body:Record<string,unknown>,key:string):string {if(typeof body[key]!=='string')throw new OperationError(400,`Missing ${key}.`);return body[key] as string;}
export function numberField(body:Record<string,unknown>,key:string):number {if(!Number.isSafeInteger(body[key])||Number(body[key])<0)throw new OperationError(400,`Invalid ${key}.`);return body[key] as number;}
export function uuid(value:string):string {if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new OperationError(400,'Invalid operation identity.');return value;}
export async function response(action:()=>Promise<unknown>) {
  try {return NextResponse.json(await action(),{headers:{'Cache-Control':'no-store'}});}
  catch(error){if(error instanceof OperationError)return NextResponse.json({error:error.message,...(error.status===429?{retryAfter:5000}:{})},{status:error.status});console.error('Application operation failed; no private work was logged.');return NextResponse.json({error:'The service could not finish this action. Your saved work is preserved.'},{status:503});}
}

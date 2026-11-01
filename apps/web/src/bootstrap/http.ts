import { NextResponse } from 'next/server';
import { OperationError } from '../../../../modules/learner-account/application/actor.ts';

export function sameOrigin(request:Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (origin && host) {
    const originHost = new URL(origin).host;
    if (originHost === host) return;
    const isLocal = (h: string) => h.startsWith('127.0.0.1') || h.startsWith('localhost');
    if (isLocal(originHost) && isLocal(host)) {
      const port1 = originHost.split(':')[1] ?? '80';
      const port2 = host.split(':')[1] ?? '80';
      if (port1 === port2) return;
    }
  }
  const referer = request.headers.get('referer');
  if (referer && host) {
    const refererHost = new URL(referer).host;
    if (refererHost === host) return;
    const isLocal = (h: string) => h.startsWith('127.0.0.1') || h.startsWith('localhost');
    if (isLocal(refererHost) && isLocal(host)) {
      const port1 = refererHost.split(':')[1] ?? '80';
      const port2 = host.split(':')[1] ?? '80';
      if (port1 === port2) return;
    }
  }
  const site = request.headers.get('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') return;

  const reqOrigin = new URL(request.url).origin;
  if (origin && origin === reqOrigin) return;

  throw new OperationError(403,'This action requires a same-origin request.');
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
  catch(error){
    const op = (error instanceof OperationError || (error && typeof error === 'object' && 'status' in error && typeof (error as {status: unknown}).status === 'number')) ? error as OperationError : undefined;
    if(op)return NextResponse.json({error:op.message,...(op.status===429?{retryAfter:5000}:{})},{status:op.status});
    console.error('Application operation failed:', error);
    return NextResponse.json({error:'The service could not finish this action. Your saved work is preserved.'},{status:503});
  }
}

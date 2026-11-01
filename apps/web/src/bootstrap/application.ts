import 'server-only';
import { cookies } from 'next/headers';
import { connect } from '../../../../infrastructure/persistence/connection.ts';
import { PostgresSubmissions } from '../../../../modules/topic-submission/adapters/postgres.ts';
import { actorFromSession } from '../../../../modules/learner-account/adapters/development-session.ts';
const globalApp=globalThis as typeof globalThis & {mcjSubmissions?:PostgresSubmissions};
export const application=globalApp.mcjSubmissions??=new PostgresSubmissions(connect().pool);
export async function authenticatedActor() {return actorFromSession((await cookies()).get('mcj_session')?.value);}

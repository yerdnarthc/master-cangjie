import { setTimeout as delay } from 'node:timers/promises';
import { connect } from '../../../infrastructure/persistence/connection.ts';
import { dispatch, ingestAvailable } from '../../../infrastructure/evaluation-transport/postgres.ts';
import { queue } from '../../../infrastructure/evaluation-transport/queue.ts';
import { requireEnv } from '../../../infrastructure/runtime/config.ts';
import { PostgresSubmissions } from '../../../modules/topic-submission/adapters/postgres.ts';
const {pool}=connect(),boss=queue(requireEnv('DATABASE_URL')),submissions=new PostgresSubmissions(pool);
let stopped=false;
process.once('SIGINT',()=>{stopped=true;});process.once('SIGTERM',()=>{stopped=true;});
await boss.start();
console.log('Trusted evaluation continuation started.');
try {
  while(!stopped) {
    try {await dispatch(pool,boss);await ingestAvailable(pool,submissions);}
    catch {console.error('Continuation interrupted; retrying durable work.');}
    await delay(500);
  }
} finally {await boss.stop();await pool.end();}

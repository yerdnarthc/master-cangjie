import { PgBoss } from 'pg-boss';
export function queue(connectionString:string) {
  const boss=new PgBoss({connectionString,schema:'evaluation_queue',migrate:false,createSchema:false,supervise:false,schedule:false});
  boss.on('error',()=>{console.error('Evaluation queue connection interrupted; durable work is retained.');});
  return boss;
}

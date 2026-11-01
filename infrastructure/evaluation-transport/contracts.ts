export type ExecutionPayload = { contractVersion:1; requestId:string; source:string; sourceHash:string;
  assessment:{topicId:string;revision:number}; caseIds:string[];
  cases:{id:string;inputBase64:string}[]; languageVersion:'1.0.5' };
export type CaseEvidence = {caseId:string;outcome:'completed'|'compile-failure'|'runtime-failure'|'timeout'|'output-limit'|'operational-error'|'interrupted';stdoutBase64:string;diagnostics:string;cleanupConfirmed:boolean;compilerVersion:string;imageId:string};
export type ExecutionOutcome = {contractVersion:1;requestId:string;sourceHash:string;assessment:{topicId:string;revision:number};generation:number;cases:CaseEvidence[]};

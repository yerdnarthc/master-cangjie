import type { Score } from '../domain/evaluation.ts';
export type Work = { problemId:string; source:string; workRevision:number; attempted:boolean };
export type FixedContext = Work & { learnerId:string; languageVersion:string; assessment:{topicId:string;revision:number}; caseIds:string[] };
export type Feedback = {caseId:string;status:string;actual?:string;expected?:string;diagnostics?:string};
export type Result = {score?:Score;solved:boolean;feedback:Feedback[]};
export type OperationView = {operationId:string;type:'evaluation'|'submission';kind?:'single'|'batch';state:'pending'|'confirmed'|'retryable-error';currentForDraft:boolean;score?:Score;feedback:Feedback[];message?:string};
export type EvaluationRequest = {requestKey:string;problemId:string;workRevision:number;assessment:{topicId:string;revision:number};kind:'single'|'batch';caseId?:string};

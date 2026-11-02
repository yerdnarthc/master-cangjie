export type Score = { earned: number; possible: number };
export type OperationView = {
  operationId: string;
  type: "evaluation" | "submission";
  kind?: "single" | "batch";
  state: "pending" | "confirmed" | "retryable-error";
  currentForDraft: boolean;
  score?: Score;
  feedback: {
    caseId: string;
    status: string;
    actual?: string;
    expected?: string;
    diagnostics?: string;
  }[];
  message?: string;
  retryAfter?: number;
};

export type ProblemSummary = {
  problemId: string;
  slug: string;
  title: string;
  testCount: number;
  solved: boolean;
  attempted: boolean;
};

export type Workspace = {
  learnerId: string;
  problem: {
    title: string;
    statement: string;
    starter: string;
    topicId: string;
    problemId: string;
    slug?: string;
    revision: number;
    languageVersion: string;
    tests: {
      id: string;
      visibility: "visible" | "hidden";
      input?: string;
      expected?: string;
    }[];
  };
  problems?: ProblemSummary[];
  draft: { source: string; workRevision: number; attempted: boolean };
  progress: {
    bestScore: Score | null;
    completed: boolean;
    canMarkComplete?: boolean;
    nextTopicAvailable: boolean;
    nextTopicId?: string | null;
  };
  latestEvaluation?: OperationView;
  latestSubmission?: OperationView;
  unresolvedSubmission?: OperationView;
};

export type SaveResult =
  | { kind: "saved"; workRevision: number }
  | {
      kind: "conflict";
      conflictId: string;
      server: { source: string; workRevision: number };
      candidate: { source: string; workRevision: number };
    };

export type Review = {
  reviewToken: string;
  unattempted: boolean;
  workRevision: number;
  source: string;
  assessment: { topicId: string; revision: number };
  problems?: {
    problemId: string;
    slug: string;
    attempted: boolean;
    caseCount: number;
  }[];
};

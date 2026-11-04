import type {
  QuizRetryIntent,
  QuizRetryReceipt,
} from "../../../../modules/activity-draft/adapters/browser-drafts.ts";

type RetryClaim = Readonly<{
  intent: QuizRetryIntent;
  receipt?: QuizRetryReceipt;
}>;

type RetryWorkspace = Readonly<{
  currentAttempt: Readonly<{ attemptId: string }>;
}>;

export type QuizRetryTransitionPorts<Workspace extends RetryWorkspace> = Readonly<{
  isOnline: () => boolean;
  claim: (intent: QuizRetryIntent) => Promise<RetryClaim>;
  sendRetry: (intent: QuizRetryIntent) => Promise<QuizRetryReceipt>;
  recordReceipt: (receipt: QuizRetryReceipt) => Promise<void>;
  loadWorkspace: () => Promise<Workspace>;
  clear: () => Promise<void>;
}>;

export async function reconcileQuizRetry<Workspace extends RetryWorkspace>(
  intent: QuizRetryIntent,
  ports: QuizRetryTransitionPorts<Workspace>,
): Promise<Readonly<{
  workspace: Workspace;
  receipt: QuizRetryReceipt;
  storageWarning: boolean;
}>> {
  if (!ports.isOnline()) {
    throw new Error("Connect to the internet before starting Retry.");
  }

  await ports.claim(intent);
  let receipt: QuizRetryReceipt;
  try {
    // The source submission is the server's stable transition identity. Repeating
    // this request recovers a receipt after an uncertain response without clearing later work.
    receipt = await ports.sendRetry(intent);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status: unknown }).status)
      : undefined;
    if (status === 400 || status === 409) await ports.clear().catch(() => {});
    throw error;
  }

  let storageWarning = false;
  try {
    await ports.recordReceipt(receipt);
  } catch {
    storageWarning = true;
  }

  const workspace = await ports.loadWorkspace();
  if (workspace.currentAttempt.attemptId === intent.expectedAttemptId) {
    throw new Error("Retry was accepted, but the active attempt has not changed yet.");
  }

  try {
    await ports.clear();
  } catch {
    storageWarning = true;
  }
  return { workspace, receipt, storageWarning };
}

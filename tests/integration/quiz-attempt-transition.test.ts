import { expect, it, vi } from "vitest";
import { reconcileQuizRetry } from "../../apps/web/src/lib/quiz-attempt-transition.ts";

const intent = {
  sourceSubmissionId: "source-submission",
  expectedAttemptId: "submitted-attempt",
  baseRevision: 4,
};

it("adopts the authoritative workspace even when another tab advanced past the retry receipt", async () => {
  const activeWorkspace = { currentAttempt: { attemptId: "later-attempt", state: "answering" } };
  const ports = {
    isOnline: () => true,
    claim: vi.fn(async () => ({ intent, receipt: undefined })),
    sendRetry: vi.fn(async () => ({ attemptId: "retry-receipt-attempt", workRevision: 5 })),
    recordReceipt: vi.fn(async () => {}),
    loadWorkspace: vi.fn(async () => activeWorkspace),
    clear: vi.fn(async () => {}),
  };

  const result = await reconcileQuizRetry(intent, ports);
  expect(result.workspace).toBe(activeWorkspace);
  expect(result.receipt).toEqual({ attemptId: "retry-receipt-attempt", workRevision: 5 });
  expect(ports.recordReceipt).toHaveBeenCalledOnce();
  expect(ports.clear).toHaveBeenCalledOnce();
});

it("keeps the retry intent when the response is lost after the server may have committed", async () => {
  const ports = {
    isOnline: () => true,
    claim: vi.fn(async () => ({ intent, receipt: undefined })),
    sendRetry: vi.fn(async () => { throw new TypeError("Network connection lost."); }),
    recordReceipt: vi.fn(async () => {}),
    loadWorkspace: vi.fn(async () => ({ currentAttempt: { attemptId: "submitted-attempt" } })),
    clear: vi.fn(async () => {}),
  };

  await expect(reconcileQuizRetry(intent, ports)).rejects.toThrow(/Network connection lost/);
  expect(ports.clear).not.toHaveBeenCalled();
  expect(ports.loadWorkspace).not.toHaveBeenCalled();
});

it("does not create a retry intent while offline", async () => {
  const ports = {
    isOnline: () => false,
    claim: vi.fn(async () => ({ intent, receipt: undefined })),
    sendRetry: vi.fn(async () => ({ attemptId: "retry-attempt", workRevision: 5 })),
    recordReceipt: vi.fn(async () => {}),
    loadWorkspace: vi.fn(async () => ({ currentAttempt: { attemptId: "retry-attempt" } })),
    clear: vi.fn(async () => {}),
  };

  await expect(reconcileQuizRetry(intent, ports)).rejects.toThrow(/internet/i);
  expect(ports.claim).not.toHaveBeenCalled();
  expect(ports.sendRetry).not.toHaveBeenCalled();
});

it("adopts server truth and reports local receipt storage failure", async () => {
  const workspace = { currentAttempt: { attemptId: "retry-attempt", state: "answering" } };
  const ports = {
    isOnline: () => true,
    claim: vi.fn(async () => ({ intent, receipt: undefined })),
    sendRetry: vi.fn(async () => ({ attemptId: "retry-attempt", workRevision: 5 })),
    recordReceipt: vi.fn(async () => { throw new Error("IndexedDB unavailable"); }),
    loadWorkspace: vi.fn(async () => workspace),
    clear: vi.fn(async () => {}),
  };

  const result = await reconcileQuizRetry(intent, ports);
  expect(result.workspace).toBe(workspace);
  expect(result.storageWarning).toBe(true);
  expect(ports.clear).toHaveBeenCalledOnce();
});

it("retains the retry intent if workspace confirmation fails after server acceptance", async () => {
  const ports = {
    isOnline: () => true,
    claim: vi.fn(async () => ({ intent, receipt: undefined })),
    sendRetry: vi.fn(async () => ({ attemptId: "retry-attempt", workRevision: 5 })),
    recordReceipt: vi.fn(async () => {}),
    loadWorkspace: vi.fn(async () => { throw new TypeError("Workspace request failed"); }),
    clear: vi.fn(async () => {}),
  };

  await expect(reconcileQuizRetry(intent, ports)).rejects.toThrow(/Workspace request failed/);
  expect(ports.recordReceipt).toHaveBeenCalledOnce();
  expect(ports.clear).not.toHaveBeenCalled();
});

it("does not send Retry when persisting its intent fails", async () => {
  const ports = {
    isOnline: () => true,
    claim: vi.fn(async () => { throw new Error("IndexedDB quota exceeded"); }),
    sendRetry: vi.fn(async () => ({ attemptId: "retry-attempt", workRevision: 5 })),
    recordReceipt: vi.fn(async () => {}),
    loadWorkspace: vi.fn(async () => ({ currentAttempt: { attemptId: "retry-attempt" } })),
    clear: vi.fn(async () => {}),
  };

  await expect(reconcileQuizRetry(intent, ports)).rejects.toThrow(/IndexedDB quota exceeded/);
  expect(ports.sendRetry).not.toHaveBeenCalled();
});

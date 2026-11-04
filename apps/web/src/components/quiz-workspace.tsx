"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import QuizFailureDialog from "./quiz-failure-dialog";
import { prepareQuizReviewNavigation } from "../lib/quiz-review-navigation";
import type { QuizBestSummary } from "../../../../modules/topic-submission/application/quiz-review.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Eraser, LoaderCircle, RotateCcw, Save, X } from "lucide-react";
import ThemeModeToggle from "./theme-mode-toggle";
import { Button } from "@/components/ui/button";
import Choicebox from "@/components/ui/choicebox";
import FlowButton, { type FlowButtonPhase } from "@/components/ui/flow-button";
import TreeNav from "@/components/ui/tree-nav";
import type {
  PublicQuiz,
  PublicQuestion,
} from "../../../../modules/roadmap/adapters/quiz-content.ts";
import type { QuizEvaluation } from "../../../../modules/topic-submission/domain/quiz-evaluation.ts";
import type { Score } from "../../../../modules/topic-submission/domain/evaluation.ts";
import type { QuizAttempt } from "../../../../modules/topic-submission/domain/quiz-attempt.ts";
import { quizDrafts, quizRetryRequests, quizSubmissionRequests, type PendingQuizSubmission, type QuizDraftSnapshot, type QuizLocalDraft, type QuizSubmissionRequest } from "../../../../modules/activity-draft/adapters/browser-drafts.ts";
import { reconcileQuizRetry } from "../lib/quiz-attempt-transition.ts";

type QuizWorkspaceData = {
  bestSubmission?: QuizBestSummary | null;
  learnerId: string;
  topicId: string;
  quiz: PublicQuiz;
  currentAttempt: QuizAttempt;
  currentAttemptIsLegacy: boolean;
  draft: { answers: Record<string, string>; workRevision: number };
  conflict?: Extract<DraftResult, { kind: "conflict" }> | null;
  progress: {
    bestScore: Score | null;
    completed: boolean;
    nextTopicAvailable: boolean;
    nextTopicId: string | null;
  };
  currentSubmission?: {
    submissionId: string;
    evaluation: QuizEvaluation;
    submittedAt: string;
  };
  latestSubmission?: { submissionId: string; submittedAt: string; score: Score };
};

type QuizDraft = { answers: Record<string, string>; workRevision: number };
type DraftResult =
  | { kind: "saved"; workRevision: number; nextConflict?: Extract<DraftResult, { kind: "conflict" }> | null }
  | { kind: "conflict"; conflictId: string; server: QuizDraft; candidate: QuizDraft };

type QuizSubmissionResult = {
  submissionId: string;
  attemptId: string;
  evaluation: QuizEvaluation;
  progress: QuizWorkspaceData['progress'];
};

function confirmedSubmission(value: QuizSubmissionResult): boolean {
  const evaluation = value?.evaluation;
  const score = evaluation?.score;
  const progress = value?.progress;
  return typeof value?.submissionId === 'string' && value.submissionId.length > 0 &&
    typeof value?.attemptId === 'string' && value.attemptId.length > 0 &&
    !!score && Number.isSafeInteger(score.earned) && score.earned >= 0 &&
    score.earned <= 100 && score.earned % 10 === 0 && score.possible === 100 &&
    typeof evaluation.passed === 'boolean' && evaluation.totalQuestions === 10 &&
    Number.isSafeInteger(evaluation.correctCount) && evaluation.correctCount >= 0 &&
    Number.isSafeInteger(evaluation.unansweredCount) && evaluation.unansweredCount >= 0 &&
    evaluation.correctCount + evaluation.unansweredCount <= 10 && score.earned === evaluation.correctCount * 10 &&
    evaluation.passed === (score.earned >= 60) &&
    Array.isArray(evaluation.questionResults) && evaluation.questionResults.length === 10 &&
    evaluation.questionResults.every(result => !!result && typeof result.questionId === 'string' &&
      typeof result.correct === 'boolean' && Number.isSafeInteger(result.earned) &&
      (result.selectedChoiceId === null || typeof result.selectedChoiceId === 'string') &&
      (result.correctChoiceId === undefined || typeof result.correctChoiceId === 'string') &&
      typeof result.explanation === 'string') &&
    !!progress && typeof progress.completed === 'boolean' &&
    typeof progress.nextTopicAvailable === 'boolean' &&
    (progress.bestScore === null || (!!progress.bestScore && Number.isSafeInteger(progress.bestScore.earned) &&
      Number.isSafeInteger(progress.bestScore.possible) && progress.bestScore.possible > 0 &&
      progress.bestScore.earned >= 0 && progress.bestScore.earned <= progress.bestScore.possible));
}

const confirmationPopVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 420, damping: 34, mass: 0.8 },
  },
};

const confirmationSequenceVariants: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.2, staggerChildren: 0.075 } },
};

const confirmationSectionVariants: Variants = {
  hidden: { opacity: 0, y: 9, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: "easeOut", when: "beforeChildren", staggerChildren: 0.065 },
  },
};

const confirmationListVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: "easeOut", when: "beforeChildren", staggerChildren: 0.045 },
  },
};

const confirmationItemVariants: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: "easeOut" } },
};

const confirmationImmediateVariants: Variants = {
  hidden: { opacity: 1, x: 0, y: 0, scale: 1 },
  visible: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: 0 } },
};

const confirmationImmediateSequenceVariants: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0, staggerChildren: 0 } },
};

class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function isRetryableDraftFailure(error: unknown): boolean {
  if (error instanceof RequestError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return error instanceof Error &&
    (error.name === "AbortError" || error instanceof TypeError);
}

async function request<T>(
  url: string,
  body?: unknown,
  method = "POST",
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (!response.ok) throw new RequestError('The request could not be completed.', response.status);
    throw error;
  }
  if (!response.ok) {
    throw new RequestError(
      data.error ?? "The request could not be completed.",
      response.status,
    );
  }
  return data as T;
}

async function timedRequest<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try { return await request<T>(url, body, method, controller.signal); }
  finally { clearTimeout(timeout); }
}

async function waitForDraftSave(promise: Promise<void>): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Draft save timed out.')), 10000);
    })]);
  } finally { if (timeout) clearTimeout(timeout); }
}

function sameAnswers(first: Record<string, string>, second: Record<string, string>): boolean {
  const keys = Object.keys(first);
  return keys.length === Object.keys(second).length && keys.every(key => Object.hasOwn(second, key) && first[key] === second[key]);
}

const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const quizProgressSpringTransition = {
  type: "spring" as const,
  stiffness: 180,
  damping: 28,
  mass: 0.75,
};
const STORAGE_WARNING = "Browser storage is unavailable. Keep this page open until your answers are saved.";

export default function QuizWorkspace({ topicId, topicTitle, categoryTitle }: { topicId: string; topicTitle: string; categoryTitle: string }) {
  const prefersReducedMotion = useReducedMotion();
  const confirmationMotion = prefersReducedMotion === true
    ? {
        pop: confirmationImmediateVariants,
        sequence: confirmationImmediateSequenceVariants,
        section: confirmationImmediateSequenceVariants,
        list: confirmationImmediateSequenceVariants,
        item: confirmationImmediateVariants,
      }
    : {
        pop: confirmationPopVariants,
        sequence: confirmationSequenceVariants,
        section: confirmationSectionVariants,
        list: confirmationListVariants,
        item: confirmationItemVariants,
      };
  const [data, setData] = useState<QuizWorkspaceData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<string>("Loading activity…");
  const [saveFeedback, setSaveFeedback] = useState<"idle" | "saving" | "saved">("idle");
  const [saveVersion, setSaveVersion] = useState(0);
  const [error, setError] = useState<string>("");
  const [draftError, setDraftError] = useState<string>("");
  const [unauthorized, setUnauthorized] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [retrying, setRetrying] = useState(false);
  const [submissionButtonFeedback, setSubmissionButtonFeedback] = useState<Exclude<FlowButtonPhase, "idle"> | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<PendingQuizSubmission | null>(null);
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const reviewInFlight = useRef(false);
  const [failureDialog, setFailureDialog] = useState<QuizEvaluation | null>(null);
  const failureShown = useRef<string | null>(null);
  const [submissionConfirmation, setSubmissionConfirmation] =
    useState<"incomplete" | "complete" | null>(null);
  const [evaluation, setEvaluation] = useState<QuizEvaluation | null>(null);
  const [conflict, setConflict] = useState<Extract<DraftResult, { kind: "conflict" }> | null>(null);
  const [resolving, setResolving] = useState(false);
  const [conflictChanged, setConflictChanged] = useState(false);
  const [hasPendingDraftSave, setHasPendingDraftSave] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [workspaceLoadRetry, setWorkspaceLoadRetry] = useState(0);
  const [questionPage, setQuestionPage] = useState(0);
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const confirmationDialogRef = useRef<HTMLDialogElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const submissionButtonSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreSubmitButtonFocus = useRef(false);
  const focusPageHeading = useRef(false);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    const workspace = sidebar?.closest<HTMLElement>(".quiz-workspace");
    if (!sidebar || !workspace) return;
    const updateHeight = () => workspace.style.setProperty("--quiz-sidebar-height", `${sidebar.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(sidebar);
    return () => {
      observer.disconnect();
      workspace.style.removeProperty("--quiz-sidebar-height");
    };
  }, [data]);

  useEffect(() => {
    if (focusPageHeading.current) {
      focusPageHeading.current = false;
      pageHeadingRef.current?.focus();
    }
  }, [questionPage]);

  useEffect(() => {
    if (!submissionConfirmation || !confirmationDialogRef.current) return;
    const dialog = confirmationDialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    confirmationHeadingRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [submissionConfirmation]);

  useEffect(() => () => {
    if (submissionButtonSuccessTimer.current !== null) {
      clearTimeout(submissionButtonSuccessTimer.current);
    }
  }, []);

  useEffect(() => {
    if (!restoreSubmitButtonFocus.current || submissionButtonFeedback !== null || !evaluation) return;
    restoreSubmitButtonFocus.current = false;
    submitButtonRef.current?.focus({ preventScroll: true });
  }, [evaluation, submissionButtonFeedback]);

  const workRevision = useRef<number>(0);
  const answersRef = useRef<Record<string, string>>({});
  const dirty = useRef<boolean>(false);
  const saving = useRef<boolean>(false);
  const saveFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFeedbackVisible = useRef(false);
  const draftSaveSettled = useRef<Promise<void> | null>(null);
  const pendingSnapshot = useRef<QuizDraftSnapshot | null>(null);
  const automaticRetries = useRef(0);
  const automaticRetryBlock = useRef<"exhausted" | "terminal" | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAction = useRef<((manual?: boolean) => Promise<boolean>) | null>(null);
  const loading = useRef(false);
  const retryLoadAfterCurrent = useRef(false);
  const submissionInFlight = useRef(false);
  const retryInFlight = useRef(false);
  const pendingSubmissionRef = useRef<PendingQuizSubmission | null>(null);
  const conflictRef = useRef<Extract<DraftResult, { kind: "conflict" }> | null>(null);
  const pendingLocal = useRef<QuizDraft | null>(null);
  const localWrites = useRef<Promise<unknown>>(Promise.resolve());
  const localTabId = useRef("");
  const activeAttemptId = useRef<string | null>(null);
  const queueLocalWrite = <T,>(work: () => Promise<T>): Promise<T> => {
    const operation = localWrites.current.catch(() => {}).then(work);
    localWrites.current = operation;
    return operation;
  };
  const preserveLocal = (learnerId: string, snapshot: QuizDraft | null) => {
    pendingLocal.current = snapshot;
    const attemptId = activeAttemptId.current;
    if (!attemptId) return;
    const operation = queueLocalWrite(() => quizDrafts.writeCurrent(
      learnerId,
      topicId,
      localTabId.current,
      attemptId,
      {
        answers: snapshot?.answers ?? answersRef.current,
        baseRevision: snapshot?.workRevision ?? workRevision.current,
        dirty: !!snapshot,
      },
    ));
    void operation.catch(() => setStorageWarning(STORAGE_WARNING));
  };
  const clearLocal = (learnerId: string, attemptId = activeAttemptId.current): Promise<void> => {
    pendingLocal.current = null;
    pendingSnapshot.current = null;
    setHasPendingDraftSave(false);
    automaticRetries.current = 0;
    automaticRetryBlock.current = null;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    if (!attemptId) return Promise.resolve();
    const operation = queueLocalWrite(() => quizDrafts.clear(learnerId, topicId, localTabId.current, attemptId));
    void operation.catch(() => setStorageWarning(STORAGE_WARNING));
    return operation;
  };

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    let loaded = false;
    setError("");
    setDraftError("");
    setStorageWarning("");
    automaticRetryBlock.current = null;
    try {
      let ws = await request<QuizWorkspaceData>(
        `/api/topics/${encodeURIComponent(topicId)}/quiz`,
      );
      let tabId = sessionStorage.getItem('mcj-quiz-tab');
      if (!tabId) { tabId = crypto.randomUUID(); sessionStorage.setItem('mcj-quiz-tab', tabId); }
      localTabId.current = tabId;
      await localWrites.current.catch(() => {});
      if (ws.learnerId) {
        try {
          const pendingRetries = await quizRetryRequests.readAll(ws.learnerId, topicId);
          for (const pendingRetry of pendingRetries) {
            if (!navigator.onLine) break;
            try {
              const transition = await reconcileQuizRetry(pendingRetry.intent, {
                isOnline: () => navigator.onLine,
                claim: intent => quizRetryRequests.claim(ws.learnerId, topicId, intent),
                sendRetry: intent => request(
                  `/api/topics/${encodeURIComponent(topicId)}/quiz/retry`,
                  { ...intent, expectedLearnerId: ws.learnerId },
                ),
                recordReceipt: receipt => quizRetryRequests.recordReceipt(
                  ws.learnerId,
                  topicId,
                  pendingRetry.intent.sourceSubmissionId,
                  receipt,
                ),
                loadWorkspace: () => request<QuizWorkspaceData>(`/api/topics/${encodeURIComponent(topicId)}/quiz`),
                clear: () => quizRetryRequests.clear(
                  ws.learnerId,
                  topicId,
                  pendingRetry.intent.sourceSubmissionId,
                ),
              });
              ws = transition.workspace;
              if (transition.storageWarning) setStorageWarning(STORAGE_WARNING);
            } catch {
              // A later reload or Retry action can reuse the same stable source identity.
              ws = await request<QuizWorkspaceData>(`/api/topics/${encodeURIComponent(topicId)}/quiz`);
              break;
            }
          }
        } catch {
          setStorageWarning(STORAGE_WARNING);
        }
      }
      let local: QuizLocalDraft | undefined;
      let pending: PendingQuizSubmission | null = null;
      if (ws.learnerId) {
        try {
          local = await quizDrafts.read(
            ws.learnerId,
            topicId,
            tabId,
            ws.currentAttempt.attemptId,
            ws.currentAttemptIsLegacy,
          );
        } catch {
          setStorageWarning(STORAGE_WARNING);
        }
        try {
          pending = await quizSubmissionRequests.read(
            ws.learnerId,
            topicId,
            ws.currentAttempt.attemptId,
            ws.currentAttemptIsLegacy,
          );
        } catch {
          setStorageWarning(STORAGE_WARNING);
        }
      }
      pendingSnapshot.current = local?.pendingSave ?? null;
      setHasPendingDraftSave(!!pendingSnapshot.current);
      pendingLocal.current = local?.dirty ? { answers: local.answers, workRevision: local.baseRevision } : null;
      pendingSubmissionRef.current = pending;
      setPendingSubmission(pending);
      if (activeAttemptId.current && activeAttemptId.current !== ws.currentAttempt.attemptId) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = null;
        if (saveFeedbackTimer.current) clearTimeout(saveFeedbackTimer.current);
        saveFeedbackTimer.current = null;
        saveFeedbackVisible.current = false;
        if (submissionButtonSuccessTimer.current !== null) {
          clearTimeout(submissionButtonSuccessTimer.current);
          submissionButtonSuccessTimer.current = null;
        }
        setSaveFeedback("idle");
        setSubmissionButtonFeedback(null);
        setSubmissionConfirmation(null);
        setFailureDialog(null);
        setQuestionPage(0);
        restoreSubmitButtonFocus.current = false;
        pendingSnapshot.current = null;
        automaticRetries.current = 0;
        automaticRetryBlock.current = null;
      }
      activeAttemptId.current = ws.currentAttempt.attemptId;
      try {
        const page = Number(sessionStorage.getItem(`quiz-page:${ws.learnerId}:${ws.currentAttempt.attemptId}`) ?? 0);
        setQuestionPage(page === 1 ? 1 : 0);
      } catch { /* Resume position is optional when storage is unavailable. */ }
      setData(ws);
      workRevision.current = ws.draft.workRevision;
      conflictRef.current = ws.conflict ?? null;
      setConflict(ws.conflict ?? null);
      const initialAnswers = ws.conflict?.candidate.answers ?? pendingLocal.current?.answers ?? ws.draft.answers ?? {};
      answersRef.current = initialAnswers;
      setAnswers(initialAnswers);
      dirty.current = !ws.conflict && !!pendingLocal.current;
      if (dirty.current) workRevision.current = pendingLocal.current!.workRevision;
      setSaveStatus(ws.conflict ? "Choose which draft to keep" : dirty.current ? "Unsaved changes" : "All changes saved");

      setEvaluation(ws.currentAttempt.state === "submitted" ? ws.currentSubmission?.evaluation ?? null : null);
      loaded = true;
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) {
        setUnauthorized(true);
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "Unable to open multiple-choice activity.",
        );
      }
    } finally {
      loading.current = false;
      if (retryLoadAfterCurrent.current) {
        retryLoadAfterCurrent.current = false;
        if (!loaded) setWorkspaceLoadRetry((version) => version + 1);
      }
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data || unauthorized) return;
    const retryLoadWhenOnline = () => {
      if (loading.current) {
        retryLoadAfterCurrent.current = true;
        return;
      }
      void load();
    };
    window.addEventListener("online", retryLoadWhenOnline);
    return () => window.removeEventListener("online", retryLoadWhenOnline);
  }, [data, load, unauthorized]);

  useEffect(() => {
    if (workspaceLoadRetry === 0 || data || unauthorized) return;
    void load();
  }, [data, load, unauthorized, workspaceLoadRetry]);

  const save = useCallback(async (manual = false): Promise<boolean> => {
    if (manual) {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      automaticRetries.current = 0;
      automaticRetryBlock.current = null;
    }
    if (!manual && automaticRetryBlock.current) return false;
    if (saving.current || conflictRef.current || submissionInFlight.current || pendingSubmissionRef.current ||
        !dirty.current || !data || data.currentAttempt.state === "submitted") return false;
    const requestAttemptId = data.currentAttempt.attemptId;
    saving.current = true;
    saveFeedbackVisible.current = false;
    if (saveFeedbackTimer.current) clearTimeout(saveFeedbackTimer.current);
    setSaveFeedback("idle");
    saveFeedbackTimer.current = setTimeout(() => {
      saveFeedbackVisible.current = true;
      setSaveFeedback("saving");
    }, 250);
    let savedSuccessfully = false;
    let settle!: () => void;
    draftSaveSettled.current = new Promise<void>(resolve => { settle = resolve; });
    setSaveStatus("Saving draft…");
    try {
      const proposed: QuizDraftSnapshot = {
        attemptId: data.currentAttempt.attemptId,
        baseRevision: workRevision.current,
        answers: { ...answersRef.current },
      };
      const beginSave = localWrites.current.catch(() => {}).then(() =>
        quizDrafts.beginSave(data.learnerId, topicId, localTabId.current, data.currentAttempt.attemptId, proposed),
      );
      localWrites.current = beginSave;
      let sentSnapshot: QuizDraftSnapshot;
      try {
        sentSnapshot = await beginSave;
      } catch {
        setStorageWarning(STORAGE_WARNING);
        sentSnapshot = pendingSnapshot.current ?? proposed;
      }
      pendingSnapshot.current = sentSnapshot;
      setHasPendingDraftSave(true);
      const res = await timedRequest<DraftResult>(
        `/api/topics/${encodeURIComponent(topicId)}/quiz/draft`,
        {
          attemptId: sentSnapshot.attemptId ?? undefined,
          baseRevision: sentSnapshot.baseRevision,
          answers: sentSnapshot.answers,
          expectedLearnerId: data.learnerId,
        },
        "PUT",
      );

      if (res.kind === "saved") {
        if (!Number.isSafeInteger(res.workRevision) || res.workRevision < 0) {
          throw new Error("The draft save could not be confirmed.");
        }
        setDraftError("");
        workRevision.current = res.workRevision;
        const acknowledge = localWrites.current.catch(() => {}).then(() =>
          quizDrafts.acknowledge(data.learnerId, topicId, localTabId.current, data.currentAttempt.attemptId, sentSnapshot, res.workRevision),
        );
        localWrites.current = acknowledge;
        let latest;
        try {
          latest = await acknowledge;
        } catch {
          setStorageWarning(STORAGE_WARNING);
        }
        if (activeAttemptId.current !== requestAttemptId) return false;
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = null;
        automaticRetries.current = 0;
        automaticRetryBlock.current = null;
        pendingSnapshot.current = latest?.pendingSave ?? null;
        setHasPendingDraftSave(!!pendingSnapshot.current);
        dirty.current = !sameAnswers(answersRef.current, sentSnapshot.answers) ||
          !!latest?.dirty || !!latest?.pendingSave;
        pendingLocal.current = dirty.current
          ? { answers: answersRef.current, workRevision: res.workRevision }
          : null;
        setSaveStatus(dirty.current ? "Unsaved changes" : "Saved on server");
        if (dirty.current) setSaveVersion(version => version + 1);
        savedSuccessfully = !dirty.current;
        return !dirty.current;
      }
      if (res.kind === "conflict") {
        setDraftError("");
        const clearPending = localWrites.current.catch(() => {}).then(() =>
          quizDrafts.clearPending(data.learnerId, topicId, localTabId.current, data.currentAttempt.attemptId, sentSnapshot),
        );
        localWrites.current = clearPending;
        try {
          await clearPending;
        } catch {
          setStorageWarning(STORAGE_WARNING);
        }
        if (activeAttemptId.current !== requestAttemptId) return false;
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = null;
        automaticRetries.current = 0;
        automaticRetryBlock.current = null;
        pendingSnapshot.current = null;
        setHasPendingDraftSave(false);
        conflictRef.current = res;
        setConflict(res);
        answersRef.current = res.candidate.answers;
        setAnswers(res.candidate.answers);
        setConflictChanged(false);
        setSaveStatus("Choose which draft to keep");
        return false;
      }
      return false;
    } catch (err) {
      if (activeAttemptId.current !== requestAttemptId) return false;
      const timedOut = err instanceof Error && err.name === "AbortError";
      const message = timedOut
        ? "Draft save timed out. Try again."
        : err instanceof Error ? err.message : "Failed to save draft.";
      if (err instanceof RequestError && err.status === 401) {
        setUnauthorized(true);
        setError(message);
      }
      if (isRetryableDraftFailure(err) && automaticRetries.current < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[automaticRetries.current];
        automaticRetries.current += 1;
        setSaveStatus("Retrying draft save…");
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          void saveAction.current?.();
        }, delay);
      } else {
        automaticRetryBlock.current = isRetryableDraftFailure(err) ? "exhausted" : "terminal";
        setSaveStatus("Failed to save draft");
      }
      if (!(err instanceof RequestError && err.status === 401)) {
        setDraftError(message);
      }
      return false;
    } finally {
      saving.current = false;
      if (saveFeedbackTimer.current) clearTimeout(saveFeedbackTimer.current);
      saveFeedbackTimer.current = null;
      if (saveFeedbackVisible.current && savedSuccessfully && !dirty.current) {
        setSaveFeedback("saved");
        saveFeedbackTimer.current = setTimeout(() => {
          saveFeedbackVisible.current = false;
          setSaveFeedback("idle");
          saveFeedbackTimer.current = null;
        }, 700);
      } else {
        saveFeedbackVisible.current = false;
        setSaveFeedback("idle");
      }
      settle();
      draftSaveSettled.current = null;
    }
  }, [data, topicId]);

  saveAction.current = save;

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (saveFeedbackTimer.current) clearTimeout(saveFeedbackTimer.current);
  }, []);

  useEffect(() => {
    if (!hasPendingDraftSave) return;
    const retryWhenOnline = () => {
      if (saving.current) return;
      if (automaticRetryBlock.current === "terminal") return;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      automaticRetryBlock.current = null;
      void save();
    };
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [hasPendingDraftSave, save]);

  const resolveConflict = async (choice: "server" | "candidate") => {
    const current = conflictRef.current;
    if (!current || saving.current) return;
    saving.current = true;
    setResolving(true);
    setError("");
    try {
      const result = await request<DraftResult>(
        `/api/topics/${encodeURIComponent(topicId)}/quiz/draft/resolve`,
        {
          attemptId: data?.currentAttempt.attemptId,
          conflictId: current.conflictId,
          choice,
          baseRevision: current.server.workRevision,
          expectedLearnerId: data?.learnerId,
        },
      );
      if (result.kind === "conflict") {
        conflictRef.current = result;
        setConflict(result);
        setConflictChanged(true);
        return;
      }
      workRevision.current = result.workRevision;
      const chosen = choice === 'server' ? current.server.answers : current.candidate.answers;
      const local = pendingLocal.current;
      if (local && sameAnswers(local.answers, current.candidate.answers)) {
        await clearLocal(data!.learnerId);
      }
      let next = result.nextConflict ?? null;
      // Preserve newer local edits as a competing draft rather than overwriting the chosen work.
      if (!next && pendingLocal.current) {
        const pending = pendingLocal.current;
        const saved = await request<DraftResult>(`/api/topics/${encodeURIComponent(topicId)}/quiz/draft`, {
          attemptId: data?.currentAttempt.attemptId,
          baseRevision: pending.workRevision, answers: pending.answers,
          expectedLearnerId: data?.learnerId,
        }, 'PUT');
        if (saved.kind === 'conflict') next = saved;
        else { workRevision.current = saved.workRevision; await clearLocal(data!.learnerId); }
      }
      await localWrites.current;
      conflictRef.current = next;
      setConflict(next);
      const displayed = next?.candidate.answers ?? (pendingLocal.current?.answers ?? chosen);
      answersRef.current = displayed;
      setAnswers(displayed);
      dirty.current = false;
      setSaveStatus(next ? "Choose which draft to keep" : "Draft choice saved");
    } catch (err) {
      await load();
      setError(err instanceof Error ? err.message : "Could not save your choice. Try again.");
    } finally {
      saving.current = false;
      setResolving(false);
    }
  };

  const updateAnswer = (questionId: string, choiceId: string | null) => {
    if (submissionInFlight.current || pendingSubmissionRef.current || data?.currentAttempt.state === "submitted") return;
    if (submissionButtonSuccessTimer.current !== null) {
      clearTimeout(submissionButtonSuccessTimer.current);
      submissionButtonSuccessTimer.current = null;
      setSubmissionButtonFeedback(null);
    }
    setSubmissionConfirmation(null);
    const updated = { ...answersRef.current };
    if (choiceId === null) delete updated[questionId];
    else updated[questionId] = choiceId;
    answersRef.current = updated;
    preserveLocal(data!.learnerId, { answers: updated, workRevision: workRevision.current });
    setAnswers(updated);
    dirty.current = true;
    setSaveStatus("Unsaved changes");
  };

  const handleSelect = (questionId: string, choiceId: string) => {
    updateAnswer(questionId, choiceId);
  };

  const handleClear = (questionId: string, button: HTMLButtonElement) => {
    if (!answersRef.current[questionId]?.trim()) return;
    const firstChoice = button
      .closest<HTMLElement>(".quiz-question-card")
      ?.querySelector<HTMLButtonElement>('[role="radio"]:not(:disabled)');
    firstChoice?.focus({ preventScroll: true });
    updateAnswer(questionId, null);
  };

  // Debounced auto-save on answer change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (dirty.current && !automaticRetryBlock.current) {
        void save();
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [answers, save, saveVersion]);

  const questions = data?.quiz.questions ?? [];
  const answeredCount = questions.filter((question) => answers[question.id]?.trim()).length;
  const unansweredNumbers = questions.flatMap((question, index) =>
    answers[question.id]?.trim() ? [] : [index + 1],
  );
  const unansweredCount = unansweredNumbers.length;
  const progressRatio = questions.length > 0 ? answeredCount / questions.length : 0;
  const progressCountOffset = questions.length > 0
    ? -(answeredCount / (questions.length + 1)) * 100
    : 0;
  const progressTransition = prefersReducedMotion === true
    ? { duration: 0 }
    : quizProgressSpringTransition;
  const incompleteConfirmation = submissionConfirmation === "incomplete";
  const showFlowSubmitButton = !data || data.currentAttempt.state === "answering" ||
    !!pendingSubmission || submissionButtonFeedback === "success";
  const flowSubmitPhase: FlowButtonPhase = submissionButtonFeedback ?? (submitting ? "loading" : "idle");
  const questionsPerPage = 5;
  const pageCount = Math.ceil(questions.length / questionsPerPage);
  const pageStart = questionPage * questionsPerPage;
  const pageEnd = Math.min(pageStart + questionsPerPage, questions.length);
  const questionGroupItems = Array.from({ length: pageCount }, (_, index) => {
    const start = index * questionsPerPage;
    const end = Math.min(start + questionsPerPage, questions.length);
    const groupSize = end - start;
    const groupAnswered = questions.slice(start, end).filter((question) => !!answers[question.id]).length;

    return {
      href: "#question-group-" + (index + 1),
      label: "Questions " + (start + 1) + "–" + end,
      badge: groupAnswered + "/" + groupSize,
      ariaLabel: "Questions " + (start + 1) + " to " + end + ", " + groupAnswered + " of " + groupSize + " answered",
      ariaControls: "quiz-questions",
      badgeClassName: groupAnswered === groupSize ? "quiz-group-progress--complete" : undefined,
    };
  });
  const changeQuestionPage = (nextPage: number) => {
    if (nextPage < 0 || nextPage >= pageCount || nextPage === questionPage) return;
    setSubmissionConfirmation(null);
    focusPageHeading.current = true;
    if (data) { try { sessionStorage.setItem(`quiz-page:${data.learnerId}:${data.currentAttempt.attemptId}`, String(nextPage)); } catch {} }
    setQuestionPage(nextPage);
  };
  const reviewUnansweredQuestions = () => {
    const firstUnanswered = unansweredNumbers[0];
    const targetPage = firstUnanswered === undefined
      ? questionPage
      : Math.floor((firstUnanswered - 1) / questionsPerPage);

    setSubmissionConfirmation(null);
    if (targetPage === questionPage) {
      requestAnimationFrame(() => pageHeadingRef.current?.focus());
      return;
    }

    focusPageHeading.current = true;
    setQuestionPage(targetPage);
  };

  const reviewAnswers = () => {
    setSubmissionConfirmation(null);
    if (questionPage !== 0) setQuestionPage(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => pageHeadingRef.current?.focus({ preventScroll: true }));
    });
  };

  const handleSubmit = async (
    bypassUnansweredCheck = false,
    bypassCompleteConfirmation = false,
  ) => {
    if (!data || submissionInFlight.current) return;
    const submissionAttemptId = data.currentAttempt.attemptId;
    if (!pendingSubmissionRef.current && conflictRef.current) return;
    const isInitialSubmission = data.currentAttempt.state === "answering";
    if (data.currentAttempt.state === "submitted" && !pendingSubmissionRef.current) return;
    if (!pendingSubmissionRef.current) {
      if (!bypassUnansweredCheck && unansweredCount > 0) {
        setSubmissionConfirmation("incomplete");
        return;
      }
      if (!bypassCompleteConfirmation && unansweredCount === 0) {
        setSubmissionConfirmation("complete");
        return;
      }
    }
    setSubmissionConfirmation(null);
    submissionInFlight.current = true;
    if (isInitialSubmission) setSubmissionButtonFeedback("loading");
    setSubmitting(true);
    setError("");
    const owner = crypto.randomUUID();
    let preparingKey: string | null = null;
    let initialSubmissionSucceeded = false;

    try {
      let pending = pendingSubmissionRef.current;
      if (!pending) {
        const proposed: QuizSubmissionRequest = {
          requestKey: crypto.randomUUID(),
          attemptId: submissionAttemptId,
          answers: { ...answersRef.current },
          assessmentRevision: data.quiz.revision,
        };
        const claim = await quizSubmissionRequests.claim(data.learnerId, topicId, submissionAttemptId, proposed, workRevision.current, owner);
        pending = claim.pending;
        pendingSubmissionRef.current = pending;
        setPendingSubmission(pending);
        if (!claim.created) {
          setError("Another submission is awaiting confirmation. Recover it before submitting again.");
          return;
        }
      }
      if (pending.phase === 'preparing') {
        const acquired = await quizSubmissionRequests.acquire(data.learnerId, topicId, submissionAttemptId, pending.request.requestKey, owner);
        if (acquired.kind === 'gone') { await load(); return; }
        if (acquired.kind === 'busy') {
          if (acquired.pending) { pendingSubmissionRef.current = acquired.pending; setPendingSubmission(acquired.pending); }
          setError('This submission is still being prepared. Try again in a moment.');
          return;
        }
        pending = acquired.pending!;
        pendingSubmissionRef.current = pending;
        setPendingSubmission(pending);
        if (acquired.kind === 'owned') {
          preparingKey = pending.request.requestKey;
          if (draftSaveSettled.current) await waitForDraftSave(draftSaveSettled.current);
          if (conflictRef.current) {
            const cancelled = await quizSubmissionRequests.releasePreparation(data.learnerId, topicId, submissionAttemptId, preparingKey, owner, true);
            if (cancelled) { pendingSubmissionRef.current = null; setPendingSubmission(null); }
            else await load();
            preparingKey = null;
            return;
          }
          const currentAnswersMatch = sameAnswers(answersRef.current, pending.request.answers);
          const draft = await timedRequest<DraftResult>(`/api/topics/${encodeURIComponent(topicId)}/quiz/draft`, {
            attemptId: pending.request.attemptId,
            baseRevision: currentAnswersMatch ? workRevision.current : pending.baseRevision,
            answers: pending.request.answers,
            expectedLearnerId: data.learnerId,
          }, 'PUT');
          if (draft.kind === 'conflict') {
            const cancelled = await quizSubmissionRequests.releasePreparation(data.learnerId, topicId, submissionAttemptId, preparingKey, owner, true);
            if (cancelled) {
              pendingSubmissionRef.current = null;
              setPendingSubmission(null);
              conflictRef.current = draft;
              setConflict(draft);
              answersRef.current = draft.candidate.answers;
              setAnswers(draft.candidate.answers);
              setSaveStatus('Choose which draft to keep');
            } else await load();
            preparingKey = null;
            return;
          }
          if (draft.kind !== 'saved' || !Number.isSafeInteger(draft.workRevision) || draft.workRevision < 0) {
            throw new Error('The draft save could not be confirmed.');
          }
          if (currentAnswersMatch) {
            workRevision.current = draft.workRevision;
            dirty.current = false;
            await clearLocal(data.learnerId);
            setSaveStatus('Saved on server');
          }
          const ready = await quizSubmissionRequests.setReady(data.learnerId, topicId, submissionAttemptId, preparingKey, owner);
          preparingKey = null;
          if (!ready) { await load(); return; }
          pending = { ...pending, phase: 'ready' };
          pendingSubmissionRef.current = pending;
          setPendingSubmission(pending);
        }
      }
      const result = await timedRequest<QuizSubmissionResult>(`/api/topics/${encodeURIComponent(topicId)}/quiz/submit`, { ...pending.request, expectedLearnerId: data.learnerId });
      if (!confirmedSubmission(result)) {
        throw new Error('The submission result could not be confirmed.');
      }
      const intendedAttemptId = pending.request.attemptId ?? submissionAttemptId;
      if (result.attemptId !== intendedAttemptId) {
        throw new Error('The submission response belongs to a different quiz attempt.');
      }
      const currentWorkspace = await request<QuizWorkspaceData>(
        `/api/topics/${encodeURIComponent(topicId)}/quiz`,
      );
      await quizSubmissionRequests.clear(data.learnerId, topicId, submissionAttemptId, pending.request.requestKey);
      pendingSubmissionRef.current = null;
      setPendingSubmission(null);

      if (currentWorkspace.currentAttempt.attemptId !== result.attemptId ||
          currentWorkspace.currentSubmission?.submissionId !== result.submissionId) {
        await clearLocal(data.learnerId, intendedAttemptId).catch(() => {});
        await load();
        return;
      }

      await clearLocal(data.learnerId, intendedAttemptId).catch(() => {});
      activeAttemptId.current = currentWorkspace.currentAttempt.attemptId;
      setEvaluation(currentWorkspace.currentAttempt.state === "submitted"
        ? currentWorkspace.currentSubmission?.evaluation ?? null
        : null);
      setData(currentWorkspace);
      if (!result.evaluation.passed && failureShown.current !== result.submissionId) {
        failureShown.current = result.submissionId;
        setFailureDialog(result.evaluation);
      }
      if (isInitialSubmission) {
        initialSubmissionSucceeded = true;
        setSubmissionButtonFeedback("success");
        if (submissionButtonSuccessTimer.current !== null) {
          clearTimeout(submissionButtonSuccessTimer.current);
        }
        submissionButtonSuccessTimer.current = setTimeout(() => {
          restoreSubmitButtonFocus.current = document.activeElement === submitButtonRef.current;
          submissionButtonSuccessTimer.current = null;
          setSubmissionButtonFeedback(null);
        }, 1800);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (preparingKey) await quizSubmissionRequests.releasePreparation(data.learnerId, topicId, submissionAttemptId, preparingKey, owner).catch(() => {});
      if (err instanceof RequestError && err.status === 401) {
        setUnauthorized(true);
        setError("Your session has ended. Open the workspace again to recover your submission.");
        return;
      }
      if (err instanceof RequestError && err.status === 409 && err.message === 'Your signed-in account changed. Reload this page to continue.') {
        setError(err.message);
        return;
      }
      setError(pendingSubmissionRef.current
        ? pendingSubmissionRef.current.phase === 'preparing'
          ? "Could not finish preparing your submission. Recover it to try again."
          : "Your submission may already be recorded. Recover it to confirm the result."
        : "Could not prepare your submission. Check browser storage and try again.");
    } finally {
      submissionInFlight.current = false;
      if (isInitialSubmission && !initialSubmissionSucceeded) setSubmissionButtonFeedback(null);
      setSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!data || data.currentAttempt.state !== "submitted" || !data.currentAttempt.submissionId ||
        retryInFlight.current || submissionInFlight.current || pendingSubmissionRef.current || reviewInFlight.current) return;

    retryInFlight.current = true;
    setRetrying(true);
    setError("");
    setDraftError("");
    let browserStorageFailed = false;

    try {
      const pendingSave = draftSaveSettled.current;
      if (pendingSave) await waitForDraftSave(pendingSave);
      await localWrites.current.catch(() => {});
      if (saving.current || submissionInFlight.current) {
        throw new Error("Wait for the current save to finish before starting Retry.");
      }

      const learnerId = data.learnerId;
      const intent = {
        sourceSubmissionId: data.currentAttempt.submissionId,
        expectedAttemptId: data.currentAttempt.attemptId,
        baseRevision: data.draft.workRevision,
      };
      const transition = await reconcileQuizRetry(intent, {
        isOnline: () => navigator.onLine,
        claim: value => quizRetryRequests.claim(learnerId, topicId, value).catch(error => {
          browserStorageFailed = true;
          throw error;
        }),
        sendRetry: value => request(
          `/api/topics/${encodeURIComponent(topicId)}/quiz/retry`,
          { ...value, expectedLearnerId: learnerId },
        ),
        recordReceipt: receipt => quizRetryRequests.recordReceipt(
          learnerId,
          topicId,
          intent.sourceSubmissionId,
          receipt,
        ).catch(error => {
          browserStorageFailed = true;
          throw error;
        }),
        loadWorkspace: () => request<QuizWorkspaceData>(
          `/api/topics/${encodeURIComponent(topicId)}/quiz`,
        ),
        clear: () => quizRetryRequests.clear(
          learnerId,
          topicId,
          intent.sourceSubmissionId,
        ).catch(error => {
          browserStorageFailed = true;
          throw error;
        }),
      });

      const workspace = transition.workspace;
      if (workspace.currentAttempt.state === "answering") setFailureDialog(null);
      if (transition.storageWarning) setStorageWarning(STORAGE_WARNING);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      if (saveFeedbackTimer.current) clearTimeout(saveFeedbackTimer.current);
      saveFeedbackTimer.current = null;
      saveFeedbackVisible.current = false;
      if (submissionButtonSuccessTimer.current !== null) {
        clearTimeout(submissionButtonSuccessTimer.current);
        submissionButtonSuccessTimer.current = null;
      }
      restoreSubmitButtonFocus.current = false;
      setSaveFeedback("idle");
      setSubmissionButtonFeedback(null);
      setSubmissionConfirmation(null);
      setFailureDialog(null);
      setQuestionPage(0);
      setHasPendingDraftSave(false);
      pendingSnapshot.current = null;
      pendingLocal.current = null;
      dirty.current = false;
      workRevision.current = workspace.draft.workRevision;
      activeAttemptId.current = workspace.currentAttempt.attemptId;
      answersRef.current = workspace.conflict?.candidate.answers ?? workspace.draft.answers ?? {};
      setAnswers(answersRef.current);
      setSaveStatus(workspace.conflict ? "Choose which draft to keep" : "All changes saved");
      conflictRef.current = workspace.conflict ?? null;
      setConflict(workspace.conflict ?? null);
      setConflictChanged(false);
      pendingSubmissionRef.current = null;
      setPendingSubmission(null);
      setEvaluation(workspace.currentAttempt.state === "submitted"
        ? workspace.currentSubmission?.evaluation ?? null
        : null);
      setData(workspace);

      // Reload the same authoritative attempt with its local recovery records. If a
      // second client advances it again, this GET adopts that newer server state.
      await load();
      if (transition.storageWarning || browserStorageFailed) setStorageWarning(STORAGE_WARNING);
      requestAnimationFrame(() => pageHeadingRef.current?.focus({ preventScroll: true }));
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    } catch (err) {
      if (browserStorageFailed) {
        setStorageWarning(STORAGE_WARNING);
        setError("Browser storage is unavailable. Retry was not started. Keep this page open, then try again.");
      } else {
        setError(err instanceof Error ? err.message : "Could not start Retry.");
      }
    } finally {
      retryInFlight.current = false;
      setRetrying(false);
    }
  };

  const handleReviewBest = async () => {
    if (!data?.bestSubmission || reviewInFlight.current || submitting || retrying) return;
    reviewInFlight.current = true;
    setReviewing(true);
    setError("");
    const learnerId = data.learnerId;
    const attemptId = data.currentAttempt.attemptId;
    let navigating = false;
    try {
      const result = await prepareQuizReviewNavigation({
        read: () => ({ identity: `${data.learnerId}:${activeAttemptId.current}`, blocked: !!conflictRef.current || !!pendingSubmissionRef.current || submissionInFlight.current, submitted: data.currentAttempt.state === "submitted", dirty: dirty.current || !!pendingSnapshot.current }),
        settle: async () => { await waitForDraftSave(localWrites.current.then(() => {})); if (draftSaveSettled.current) await waitForDraftSave(draftSaveSettled.current); },
        flush: async () => {
          const previousRevision = workRevision.current;
          const previousPending = pendingSnapshot.current;
          const clean = await save(true);
          // Replaying a pending snapshot can succeed while newer choices remain dirty.
          // An advanced confirmed revision is progress; drain the remaining choices next.
          return clean || (!conflictRef.current && (workRevision.current !== previousRevision || (!!previousPending && !pendingSnapshot.current)));
        },
      });
      if (result !== "ready") throw new Error("Your latest answers haven't been saved yet. Resolve any draft conflict or save error, then try review again.");
      const current = await request<{learnerId:string;currentAttempt:QuizAttempt}>(`/api/topics/${encodeURIComponent(topicId)}/quiz/activity-state`);
      if (current.learnerId !== learnerId || current.currentAttempt?.attemptId !== attemptId || activeAttemptId.current !== attemptId) throw new Error("Your account or attempt changed. Reload before opening review.");
      router.push(`/topics/${topicId}/activity/review`);
      navigating = true;
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your answers. Try again before opening review."); }
    finally { if (!navigating) { reviewInFlight.current = false; setReviewing(false); } }
  };

  if (unauthorized) {
    return (
      <div className="quiz-workspace">
        <main className="entry-panel">
          <h1>Multiple-choice Activity</h1>
          <p className="quiz-activity-kind">MasterCangjie ? Development Session</p>
          <p>Open the development learner workspace to practice this multiple-choice activity.</p>
          <p>
            <Link href={`/topics/${topicId}`}>Back to lesson</Link>
          </p>
          <button
            type="button"
            className="primary"
            onClick={async () => {
              await request('/api/session', {});
              setUnauthorized(false);
              void load();
            }}
          >
            Open development workspace
          </button>
          {error && <p role="alert">{error}</p>}
        </main>
      </div>
    );
  }

  if (!data && !error) {
    return (
      <div className="workspace-shell quiz-workspace">
        <header className="topbar">
          <Link href="/">MasterCangjie</Link>
          <span className="muted">Multiple-choice activity</span>
          <ThemeModeToggle />
        </header>
        <main>
          <p>Loading multiple-choice assessment…</p>
        </main>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="workspace-shell quiz-workspace">
        <header className="topbar">
          <Link href="/">MasterCangjie</Link>
          <span className="muted">Multiple-choice activity</span>
          <ThemeModeToggle />
        </header>
        <main>
          <div className="panel error">
            <h2>Unable to load activity</h2>
            <p>{error}</p>
            <Link href={`/topics/${topicId}`}>Return to topic handout</Link>
          </div>
        </main>
      </div>
    );
  }

  const resultFeedbackMap = new Map(
    evaluation?.questionResults.map((r) => [r.questionId, r]) ?? [],
  );
  const submittedAttempt = data?.currentAttempt.state === "submitted";

  return (
    <div className="workspace-shell quiz-workspace">
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
        <span className="muted">{categoryTitle}</span>
        <div className="quiz-header-actions">
          <Link href={`/topics/${topicId}`}><ArrowLeft size={17} aria-hidden="true" /> Back to lesson</Link>
        </div>
        <ThemeModeToggle />
      </header>

      <main>
        {(error || draftError) && (
          <div className="panel error quiz-message" role="alert">
            {error && <p>{error}</p>}
            {draftError && <p>{draftError}</p>}
          </div>
        )}

        {pendingSubmission && (
          <div className="panel notice quiz-message" role="status">
            <p>{pendingSubmission.phase === 'preparing'
              ? 'Your submission is being prepared. Recover it if this is interrupted.'
              : 'Your submission is waiting for confirmation. It uses the answers you submitted, which may differ from your current draft. Recover it before starting another attempt.'}</p>
          </div>
        )}

        {conflict && (
          <section className="panel notice" aria-labelledby="draft-conflict-heading">
            <h2 id="draft-conflict-heading">Choose which answers to keep</h2>
            <p>Another version of this draft was saved. Compare the answers and choose which version to use.</p>
            {conflictChanged && <p role="status">The saved answers changed again. Review both versions and choose again.</p>}
            {([
              ["Saved answers", conflict.server.answers],
              ["My answers", answers],
            ] as const).map(([label, version]) => (
              <div key={label}>
                <h3>{label}</h3>
                <ul>{questions.map(q => <li key={q.id}>{q.prompt}: {q.choices.find(c => c.id === version[q.id])?.text ?? "Unanswered"}</li>)}</ul>
              </div>
            ))}
            <div className="actions">
              <button type="button" disabled={resolving} onClick={() => void resolveConflict("server")}>Keep saved answers</button>
              <button type="button" disabled={resolving} onClick={() => void resolveConflict("candidate")}>Keep my answers</button>
            </div>
          </section>
        )}

        {data?.bestSubmission && <section className="panel quiz-best-access" aria-label="Best submission review"><div><h2>Best submission</h2><p>Your saved result stays available while you practice.</p></div><button type="button" disabled={reviewing || submitting || retrying || !!pendingSubmission} onClick={() => void handleReviewBest()}>{reviewing ? "Saving before review…" : `Review best submission · ${data.bestSubmission.score.earned}/${data.bestSubmission.score.possible}`}</button></section>}
        {failureDialog && <QuizFailureDialog evaluation={failureDialog} completed={!!data?.progress.completed} busy={retrying} error={error} onClose={() => { setFailureDialog(null); requestAnimationFrame(() => pageHeadingRef.current?.focus()); }} onRetry={() => void handleRetry()} />}

        {/* Post-submission score banner */}
        {evaluation && (
          <div
            className={`panel quiz-result-banner ${evaluation.passed ? "quiz-result-banner--passed" : "quiz-result-banner--failed"}`}
            role="status"
            aria-live="polite"
          >
            <h2 className="quiz-result-title">Latest submission result</h2>
            <div className="quiz-result-content">
              <div>
                <p className={`score ${evaluation.passed ? "quiz-score--passed" : "quiz-score--failed"}`}>
                  {evaluation.score.earned} / {evaluation.score.possible} (
                  {evaluation.passed ? "Passed!" : "Needs at least 60 to pass"})
                </p>
                <p className="muted quiz-result-breakdown">
                  {evaluation.correctCount} correct ·{" "}
                  {10 - evaluation.correctCount - evaluation.unansweredCount}{" "}
                  incorrect · {evaluation.unansweredCount} unanswered
                </p>
              </div>

              {data?.progress.completed && (
                <div className="quiz-completion-action">
                  <p className="quiz-topic-completed">
                    Topic completed!
                  </p>
                  <Link
                    className="activity-link"
                    href={
                      data?.progress.nextTopicId
                        ? `/topics/${data.progress.nextTopicId}`
                        : "/"
                    }
                  >
                    {data?.progress.nextTopicId ? "Continue to next topic" : "Back to roadmap"} <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {!evaluation && data?.progress.completed && (
          <div className="panel quiz-result-banner quiz-result-banner--passed">
            <div className="quiz-result-content">
              <div className="quiz-completion-action">
                <p className="quiz-topic-completed">Topic completed!</p>
                <Link
                  className="activity-link"
                  href={data.progress.nextTopicId ? `/topics/${data.progress.nextTopicId}` : "/"}
                >
                  {data?.progress.nextTopicId ? "Continue to next topic" : "Back to roadmap"} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="quiz-layout">
          <aside ref={sidebarRef} className="quiz-sidebar" aria-labelledby="quiz-progress-heading">
            <div className="quiz-sidebar-title">
              <h1>{data?.quiz.title}</h1>
              {data?.quiz.title !== topicTitle && <p className="quiz-activity-kind">{topicTitle}</p>}
            </div>
            <h2 id="quiz-progress-heading">Your progress</h2>
            <p className="quiz-progress-count">
              <strong>
                <span className="sr-only">{answeredCount}</span>
                <span className="quiz-progress-count-window" aria-hidden="true">
                  <motion.span
                    className="quiz-progress-count-track"
                    initial={false}
                    animate={{ y: `${progressCountOffset}%` }}
                    transition={progressTransition}
                  >
                    {Array.from({ length: questions.length + 1 }, (_, count) => (
                      <span className="quiz-progress-count-step" key={count}>{count}</span>
                    ))}
                  </motion.span>
                </span>
              </strong>
              <span> / {questions.length} answered</span>
            </p>
            <div
              className="quiz-progress-bar"
              role="progressbar"
              aria-label="Questions answered"
              aria-valuemin={0}
              aria-valuemax={questions.length}
              aria-valuenow={answeredCount}
              aria-valuetext={`${answeredCount} of ${questions.length} questions answered`}
            >
              <motion.span
                className="quiz-progress-fill"
                initial={false}
                animate={{ scaleX: progressRatio }}
                transition={progressTransition}
              />
            </div>
            <nav className="quiz-page-nav" aria-label="Question groups">
              <TreeNav
                items={questionGroupItems}
                activeHref={"#question-group-" + (questionPage + 1)}
                rowHeight={44}
                className="quiz-tree-nav"
                onSelect={(item, event) => {
                  event.preventDefault();
                  const nextPage = questionGroupItems.findIndex((group) => group.href === item.href);
                  changeQuestionPage(nextPage);
                }}
              />
            </nav>
            {(data?.progress.bestScore || data?.progress.completed) && (
              <div className="quiz-sidebar-summary">
                {data?.progress.bestScore && <p>Best score <strong>{data.progress.bestScore.earned}/{data.progress.bestScore.possible}</strong></p>}
                {data?.progress.completed ? <p className="quiz-progress--complete">Topic completed</p> : null}
              </div>
            )}
          </aside>

          <section className="quiz-question-area" id="quiz-questions" aria-labelledby="quiz-page-heading">
            <div className="quiz-page-heading-row">
              <h2 id="quiz-page-heading" ref={pageHeadingRef} tabIndex={-1}>Questions {pageStart + 1}–{pageEnd}</h2>
              <span>Page {questionPage + 1} of {pageCount}</span>
            </div>
            <div className="quiz-question-list">
          {questions.slice(pageStart, pageEnd).map((q: PublicQuestion, pageIndex: number) => {
            const idx = pageStart + pageIndex;
            const selected = answers[q.id];
            const feedback = resultFeedbackMap.get(q.id);
            const submittedChoiceId = feedback?.selectedChoiceId ?? null;
            const currentChoiceId = selected ?? null;
            const draftChanged = !!feedback && currentChoiceId !== submittedChoiceId;
            const resultStatus = feedback && !draftChanged
              ? feedback.correct
                ? "Correct"
                : feedback.selectedChoiceId
                  ? "Mistake"
                  : "Not answered"
              : selected
                ? "Answered"
                : "Not answered";
            const resultStatusKind = feedback && !draftChanged
              ? feedback.correct
                ? "correct"
                : feedback.selectedChoiceId
                  ? "mistake"
                  : "not-answered"
              : selected
                ? "answered"
                : "not-answered";
            const statusId = `question-status-${q.id}`;
            const draftStatusId = `question-draft-status-${q.id}`;
            const promptId = `question-prompt-${q.id}`;

            return (
              <section
                key={q.id}
                className="quiz-question-card"
                id={`q-${q.id}`}
                aria-labelledby={promptId}
              >
                <div className="quiz-question-meta">
                  <p className="quiz-question-index">Question {idx + 1} of 10</p>
                  <div className="quiz-question-status">
                    <AnimatePresence initial={false} mode="wait">
                      <motion.span
                        key={resultStatusKind}
                        id={statusId}
                        className={`quiz-state-label quiz-state-label--${resultStatusKind}`}
                        initial={{
                          opacity: 0,
                          y: prefersReducedMotion ? 0 : 4,
                          scale: prefersReducedMotion ? 1 : 0.96,
                        }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{
                          opacity: 0,
                          y: prefersReducedMotion ? 0 : -3,
                          scale: prefersReducedMotion ? 1 : 0.98,
                        }}
                        transition={{
                          y: { type: "spring", stiffness: 440, damping: 36, mass: 0.55 },
                          scale: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
                          opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                        }}
                      >
                        {resultStatusKind === "correct" && <Check size={15} aria-hidden="true" />}
                        {resultStatusKind === "mistake" && <X size={15} aria-hidden="true" />}
                        {resultStatus}
                      </motion.span>
                    </AnimatePresence>
                    {draftChanged && (
                      <span className="quiz-draft-status" id={draftStatusId}>
                        Draft changed ? not evaluated
                      </span>
                    )}
                    <AnimatePresence initial={false}>
                      {selected?.trim() && (
                        <motion.div
                          key="clear-answer"
                          className="inline-flex"
                          initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 5 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{
                            opacity: 0,
                            x: prefersReducedMotion ? 0 : 3,
                            transition: { duration: 0.12, ease: "easeIn" },
                          }}
                          transition={{
                            x: { type: "spring", stiffness: 460, damping: 38, mass: 0.5 },
                            opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                          }}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="quiz-clear-answer h-11 min-h-11 gap-1.5 px-3"
                            aria-label={`Clear answer to Question ${idx + 1}`}
                            disabled={reviewing || submittedAttempt || !!conflict || submitting || !!pendingSubmission}
                            onClick={(event) => handleClear(q.id, event.currentTarget)}
                          >
                            <Eraser aria-hidden="true" />
                            Clear
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <h3 className="quiz-question-prompt" id={promptId}>
                  {q.prompt}
                </h3>

                <fieldset className="quiz-choice-group" aria-describedby={`${statusId}${draftChanged ? ` ${draftStatusId}` : ""}`}>
                  <legend className="sr-only">Choices for Question {idx + 1}</legend>
                  <Choicebox
                    className="quiz-choice-list"
                    labelledBy={promptId}
                    describedBy={`${statusId}${draftChanged ? ` ${draftStatusId}` : ""}`}
                    name={`q-${q.id}`}
                    value={selected ?? ""}
                    onChange={(choice) => handleSelect(q.id, choice as string)}
                    disabled={reviewing || submittedAttempt || !!conflict || submitting || !!pendingSubmission}
                    options={q.choices.map((choice) => {
                      const isChosen = selected === choice.id;
                      const isSubmitted = !!feedback && submittedChoiceId === choice.id;
                      const isCorrectAnswer = !!feedback && (
                        feedback.correctChoiceId === choice.id ||
                        (feedback.correct && submittedChoiceId === choice.id)
                      );
                      const isMistakenSubmission = isSubmitted && !feedback.correct;
                      const choiceLabels = [
                        isSubmitted ? (draftChanged ? "Submitted answer" : "Your answer") : null,
                        isCorrectAnswer ? "Correct answer" : null,
                        draftChanged && isChosen ? "Current answer" : null,
                      ].filter((label): label is string => !!label);
                      const choiceClassName = [
                        "quiz-choice",
                        isChosen ? "quiz-choice--selected" : "",
                        isSubmitted ? "quiz-choice--submitted" : "",
                        isMistakenSubmission ? "quiz-choice--mistake" : "",
                        isCorrectAnswer ? "quiz-choice--correct" : "",
                        draftChanged && isChosen ? "quiz-choice--current" : "",
                      ].filter(Boolean).join(" ");
                      return {
                        id: choice.id,
                        title: choice.text,
                        className: choiceClassName,
                        meta: choiceLabels.length > 0 ? (
                          <span className="quiz-choice-labels">
                            {choiceLabels.map((label) => <span key={label} className="quiz-choice-label">{label}</span>)}
                          </span>
                        ) : undefined,
                      };
                    })}
                  />
                </fieldset>

                {/* The explanation and answer key are available only in a confirmed result. */}
                {feedback && (
                  <div className="quiz-explanation">
                    <p className="quiz-explanation-heading">Tutor explanation</p>
                    <p className="quiz-explanation-copy">{feedback.explanation}</p>
                  </div>
                )}
              </section>
            );
          })}
            </div>

            {submissionConfirmation && (
              <motion.dialog
                ref={confirmationDialogRef}
                className="quiz-confirm-dialog"
                variants={confirmationMotion.pop}
                initial="hidden"
                animate="visible"
                aria-labelledby={incompleteConfirmation ? "quiz-confirm-title" : "quiz-confirm-ready-title"}
                aria-describedby={incompleteConfirmation
                  ? "quiz-confirm-description quiz-confirm-unanswered-label quiz-confirm-unanswered-list"
                  : "quiz-confirm-ready-status quiz-confirm-ready-description"}
                onKeyDown={(event) => {
                  if (event.key !== "Tab") return;

                  const dialog = event.currentTarget;
                  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                  ));
                  const firstFocusable = focusable[0];
                  const lastFocusable = focusable[focusable.length - 1];
                  if (!firstFocusable || !lastFocusable) {
                    event.preventDefault();
                    return;
                  }

                  const activeElement = document.activeElement;
                  const focusOutsideDialog = !dialog.contains(activeElement);
                  const focusOnHeading = activeElement === confirmationHeadingRef.current;

                  if (event.shiftKey && (
                    activeElement === firstFocusable || focusOnHeading || focusOutsideDialog
                  )) {
                    event.preventDefault();
                    lastFocusable.focus();
                  } else if (!event.shiftKey && (
                    activeElement === lastFocusable || focusOutsideDialog
                  )) {
                    event.preventDefault();
                    firstFocusable.focus();
                  }
                }}
                onCancel={(event) => {
                  event.preventDefault();
                  setSubmissionConfirmation(null);
                  requestAnimationFrame(() => submitButtonRef.current?.focus({ preventScroll: true }));
                }}
              >
                <motion.div
                  className="quiz-confirm-content"
                  variants={confirmationMotion.sequence}
                  initial="hidden"
                  animate="visible"
                >
                    <motion.div className="quiz-confirm-heading" variants={confirmationMotion.section}>
                      <motion.span
                        className={`quiz-confirm-icon${incompleteConfirmation ? "" : " quiz-confirm-ready-icon"}`}
                        variants={confirmationMotion.item}
                      >
                        {incompleteConfirmation
                          ? <CircleAlert size={22} aria-hidden="true" />
                          : <Check size={22} aria-hidden="true" />}
                      </motion.span>
                      {incompleteConfirmation ? (
                        <motion.h2 id="quiz-confirm-title" ref={confirmationHeadingRef} tabIndex={-1} variants={confirmationMotion.item}>
                          {unansweredCount} question{unansweredCount === 1 ? "" : "s"} left to answer
                        </motion.h2>
                      ) : (
                        <motion.h2 id="quiz-confirm-ready-title" ref={confirmationHeadingRef} tabIndex={-1} variants={confirmationMotion.item}>
                          Ready to submit your activity?
                        </motion.h2>
                      )}
                    </motion.div>
                    {incompleteConfirmation ? (
                      <>
                        <motion.p id="quiz-confirm-description" className="quiz-confirm-description" variants={confirmationMotion.item}>
                          Unanswered questions receive 0 points with no partial credit.
                        </motion.p>
                        <motion.section
                          className="quiz-confirm-unanswered"
                          aria-labelledby="quiz-confirm-unanswered-label"
                          variants={confirmationMotion.section}
                        >
                          <motion.h3 id="quiz-confirm-unanswered-label" variants={confirmationMotion.item}>
                            Unanswered questions
                          </motion.h3>
                          <motion.ul id="quiz-confirm-unanswered-list" variants={confirmationMotion.list}>
                            {unansweredNumbers.map((questionNumber) => (
                              <motion.li key={questionNumber} aria-label={`Question ${questionNumber}`} variants={confirmationMotion.item}>
                                Q{questionNumber}
                              </motion.li>
                            ))}
                          </motion.ul>
                        </motion.section>
                        <motion.div className="quiz-confirm-actions" variants={confirmationMotion.section}>
                          <motion.div className="quiz-confirm-action" variants={confirmationMotion.item}>
                            <Button
                              type="button"
                              size="lg"
                              className="quiz-confirm-action-button quiz-confirm-primary"
                              onClick={reviewUnansweredQuestions}
                            >
                              Review unanswered questions
                            </Button>
                          </motion.div>
                          <motion.div className="quiz-confirm-action" variants={confirmationMotion.item}>
                            <Button
                              type="button"
                              variant="outline"
                              size="lg"
                              className="quiz-confirm-action-button quiz-confirm-submit-anyway"
                              onClick={() => void handleSubmit(true)}
                              disabled={submitting}
                            >
                              <span>Submit anyway</span>
                              <span className="quiz-confirm-action-detail">(0 points for unanswered)</span>
                            </Button>
                          </motion.div>
                        </motion.div>
                      </>
                    ) : (
                      <>
                        <motion.div
                          id="quiz-confirm-ready-status"
                          className="quiz-confirm-ready-status"
                          variants={confirmationMotion.item}
                        >
                          <span>All questions answered</span>
                          <strong>{answeredCount} / 10</strong>
                        </motion.div>
                        <motion.p id="quiz-confirm-ready-description" className="quiz-confirm-description" variants={confirmationMotion.item}>
                          Submitting saves these choices with this attempt. You can change them in a retry.
                        </motion.p>
                        <motion.div className="quiz-confirm-actions" variants={confirmationMotion.section}>
                          <motion.div className="quiz-confirm-action" variants={confirmationMotion.item}>
                            <Button
                              type="button"
                              variant="outline"
                              size="lg"
                              className="quiz-confirm-action-button"
                              onClick={reviewAnswers}
                            >
                              Review answers
                            </Button>
                          </motion.div>
                          <motion.div className="quiz-confirm-action" variants={confirmationMotion.item}>
                            <Button
                              type="button"
                              size="lg"
                              className="quiz-confirm-action-button quiz-confirm-primary"
                              onClick={() => void handleSubmit(false, true)}
                              disabled={submitting}
                            >
                              Submit activity
                            </Button>
                          </motion.div>
                        </motion.div>
                      </>
                    )}
                </motion.div>
              </motion.dialog>
            )}

        {storageWarning && <p className="quiz-storage-warning" role="status">{storageWarning}</p>}

        <div className="quiz-action-dock">
          <p className="quiz-dock-status" role="status" aria-live="polite">
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={saveStatus}
                className="quiz-dock-status-message"
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -3 }}
                transition={{
                  y: { type: "spring", stiffness: 440, damping: 36, mass: 0.55 },
                  opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                }}
              >
                {saveStatus}
              </motion.span>
            </AnimatePresence>
          </p>
          <div className="actions">
              <button
                type="button"
                className={`quiz-save-button${saveFeedback !== "idle" ? ` is-${saveFeedback}` : ""}`}
                aria-label={saveStatus.includes("Saving") || saveStatus.includes("Retrying") ? "Saving draft" : "Save draft"}
                title="Save draft"
                onClick={() => void save(true)}
                disabled={reviewing || submittedAttempt || !!conflict || submitting || !!pendingSubmission || saving.current || !dirty.current}
              >
                {saveFeedback === "saving"
                  ? <LoaderCircle className="quiz-save-spinner" size={19} aria-hidden="true" />
                  : saveFeedback === "saved"
                    ? <Check size={19} aria-hidden="true" />
                    : <Save size={18} aria-hidden="true" />}
                <span className="quiz-save-label">Save draft</span>
              </button>
              {showFlowSubmitButton ? (
                <FlowButton
                  ref={submitButtonRef}
                  phase={flowSubmitPhase}
                  label={pendingSubmission ? "Recover submission" : "Submit activity"}
                  loadingLabel="Evaluating..."
                  successLabel="Activity submitted"
                  disabled={reviewing || (!!conflict && !pendingSubmission)}
                  onClick={() => void handleSubmit(false)}
                />
              ) : null}
          </div>
        </div>
          </section>
        </div>
      </main>
    </div>
  );
}

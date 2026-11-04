"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { QuizActivityState } from "../../../../modules/topic-submission/application/quiz-review.ts";
import { quizActivityAction } from "../../../../modules/topic-submission/domain/quiz-activity-actions.ts";
import {
  quizRetryRequests,
  quizSubmissionRequests,
} from "../../../../modules/activity-draft/adapters/browser-drafts.ts";
import { reconcileQuizRetry } from "../lib/quiz-attempt-transition.ts";
export default function QuizTopicActions({
  topicId,
  initialState,
}: {
  topicId: string;
  initialState: QuizActivityState;
}) {
  const [state, setState] = useState(initialState),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false);
  const router = useRouter();
  const base = `/api/topics/${encodeURIComponent(topicId)}/quiz`;
  async function read(): Promise<QuizActivityState> {
    const r = await fetch(`${base}/activity-state`, { cache: "no-store" });
    const value = await r.json();
    if (!r.ok)
      throw new Error(
        value.error ??
          "Could not load this activity. Reload the page to try again.",
      );
    if (value.learnerId !== initialState.learnerId)
      throw new Error(
        "Your signed-in account changed. Reload this page to continue.",
      );
    return value;
  }
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void read()
        .then((value) => {
          if (!disposed) {
            setState(value);
            setError("");
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    };
    refresh();
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [topicId, initialState]);
  async function retry() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!navigator.onLine)
        throw new Error("Connect to the internet before starting Retry.");
      const current = await read();
      setState(current);
      if (current.currentAttempt?.state !== "submitted") {
        router.push(`/topics/${topicId}/activity`);
        return;
      }
      const pending = (
        await quizSubmissionRequests.readAll(current.learnerId, topicId)
      ).length;
      if (pending) {
        router.push(`/topics/${topicId}/activity`);
        return;
      }
      const intent = {
        sourceSubmissionId: current.currentAttempt.submissionId,
        expectedAttemptId: current.currentAttempt.attemptId,
        baseRevision: current.workRevision!,
      };
      await reconcileQuizRetry(intent, {
        isOnline: () => navigator.onLine,
        claim: (v) => quizRetryRequests.claim(current.learnerId, topicId, v),
        sendRetry: async (v) => {
          const r = await fetch(`${base}/retry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...v,
              expectedLearnerId: current.learnerId,
            }),
          });
          const value = await r.json();
          if (!r.ok)
            throw Object.assign(new Error(value.error), { status: r.status });
          return value;
        },
        recordReceipt: (r) =>
          quizRetryRequests.recordReceipt(
            current.learnerId,
            topicId,
            intent.sourceSubmissionId,
            r,
          ),
        loadWorkspace: async () => {
          const value = await read();
          if (!value.currentAttempt)
            throw new Error("The new attempt could not be loaded.");
          return { ...value, currentAttempt: value.currentAttempt };
        },
        clear: () =>
          quizRetryRequests.clear(
            current.learnerId,
            topicId,
            intent.sourceSubmissionId,
          ),
      });
      router.push(`/topics/${topicId}/activity`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not start Retry. Try again.",
      );
      try {
        setState(await read());
      } catch {}
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const action = quizActivityAction({
    hasSubmission: !!state.bestSubmission,
    hasAnsweringAttempt: state.currentAttempt?.state === "answering",
  });
  return (
    <div className="quiz-topic-actions">
      <div className="actions">
        {state.bestSubmission && (
          <Link
            className="activity-link"
            prefetch={false}
            href={`/topics/${topicId}/activity/review`}
          >
            Review best submission · {state.bestSubmission.score.earned}/
            {state.bestSubmission.score.possible}
          </Link>
        )}
        {action === "retry" ? (
          <button
            type="button"
            className="primary"
            disabled={busy || !!error}
            onClick={() => void retry()}
          >
            {busy ? "Starting retry…" : "Retry"}
          </button>
        ) : (
          <Link
            className="activity-link"
            prefetch={false}
            href={`/topics/${topicId}/activity`}
          >
            {action === "start" ? "Start activity" : "Continue activity"}
          </Link>
        )}
      </div>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              void read()
                .then((value) => {
                  setState(value);
                  setError("");
                })
                .catch((error) => setError(error.message));
            }}
          >
            Reload activity status
          </button>
        </p>
      )}
    </div>
  );
}

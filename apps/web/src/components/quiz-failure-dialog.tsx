"use client";
import { useEffect, useRef } from "react";
import type { QuizEvaluation } from "../../../../modules/topic-submission/domain/quiz-evaluation.ts";
export default function QuizFailureDialog({
  evaluation,
  completed,
  busy,
  error,
  onClose,
  onRetry,
}: {
  evaluation: QuizEvaluation;
  completed: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="quiz-failure-dialog"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (!first) { event.preventDefault(); dialog.current?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}
      aria-labelledby="quiz-failure-title"
      aria-describedby="quiz-failure-description"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="quiz-failure-title">Try another attempt</h2>
      <p className="score">
        You scored {evaluation.score.earned}/{evaluation.score.possible}
      </p>
      <p id="quiz-failure-description">
        {completed
          ? "This attempt is below 60/100. Your topic stays complete, and your unlocked topics remain available."
          : "You need at least 60/100 to complete this topic and unlock the next one. Review your answers or try again."}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button type="button" disabled={busy} autoFocus onClick={onClose}>
          Review answers
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={onRetry}
        >
          {busy ? "Starting retry…" : "Retry"}
        </button>
      </div>
    </dialog>
  );
}

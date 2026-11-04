"use client";
import Link from "next/link";
import { useState, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, Minus, X } from "lucide-react";
import type { QuizBestReview as Review } from "../../../../modules/topic-submission/application/quiz-review.ts";
import ThemeModeToggle from "./theme-mode-toggle";
export default function QuizBestReview({
  review,
  topicTitle,
}: {
  review: Review;
  topicTitle: string;
}) {
  const [group, setGroup] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  function navigate(next: number) {
    setGroup(next);
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "start" });
    });
  }
  return (
    <div className="workspace-shell quiz-workspace quiz-review">
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
        <Link href={`/topics/${review.topicId}`}>Back to topic</Link>
        <ThemeModeToggle />
      </header>
      <main>
        <section className="panel quiz-review-summary">
          <div>
            <h1>Best submission</h1>
            <p>{topicTitle}</p>
            <p className="muted">
              Submitted{" "}
              <time dateTime={review.submission.submittedAt}>
                {new Date(review.submission.submittedAt).toLocaleString("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </time>{" "}
              · Assessment revision {review.quiz.revision}
            </p>
          </div>
          <div>
            <p className="score">
              {review.submission.score.earned}/
              {review.submission.score.possible}
            </p>
            <p>{review.evaluation.passed ? "Passed" : "Below passing score"}</p>
          </div>
          <p className="muted">
            These are your saved answers. They stay unchanged when you try
            another attempt.
          </p>
        </section>
        <nav className="quiz-review-nav" aria-label="Review question groups">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              aria-current={group === i ? "page" : undefined}
              onClick={() => navigate(i)}
            >
              Questions {i === 0 ? "1–5" : "6–10"}
            </button>
          ))}
        </nav>
        <h2 ref={heading} tabIndex={-1}>
          Questions {group === 0 ? "1–5" : "6–10"}
        </h2>
        <div className="quiz-review-questions">
          {review.quiz.questions
            .slice(group * 5, group * 5 + 5)
            .map((q, index) => {
              const feedback = review.evaluation.questionResults.find(
                (r) => r.questionId === q.id,
              )!;
              return (
                <article
                  key={q.id}
                  className="panel quiz-review-question"
                  aria-labelledby={`review-${q.id}`}
                >
                  <h3 id={`review-${q.id}`}>
                    Question {group * 5 + index + 1}: {q.prompt}
                  </h3>
                  <p className="quiz-review-outcome">
                    {feedback.correct ? (
                      <Check size={18} aria-hidden="true" />
                    ) : feedback.selectedChoiceId ? (
                      <X size={18} aria-hidden="true" />
                    ) : (
                      <Minus size={18} aria-hidden="true" />
                    )}
                    {feedback.correct
                      ? "Correct"
                      : feedback.selectedChoiceId
                        ? "Incorrect"
                        : "Unanswered"}{" "}
                    · {feedback.earned}/10
                  </p>
                  <ul className="quiz-review-choices">
                    {q.choices.map((choice) => (
                      <li
                        key={choice.id}
                        className={`${feedback.selectedChoiceId === choice.id ? "is-selected " : ""}${feedback.correctChoiceId === choice.id ? "is-correct" : ""}`}
                      >
                        <span>{choice.text}</span>
                        <span className="quiz-review-choice-labels">
                          {feedback.selectedChoiceId === choice.id && (
                            <strong>Your answer</strong>
                          )}
                          {feedback.correctChoiceId === choice.id && (
                            <strong>Correct answer</strong>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="quiz-review-explanation">
                    <h4>Explanation</h4>
                    <p>{feedback.explanation}</p>
                  </div>
                </article>
              );
            })}
        </div>
        <nav className="quiz-review-nav" aria-label="Review pagination">
          <button
            type="button"
            disabled={group === 0}
            onClick={() => navigate(0)}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Previous questions
          </button>
          <span>Page {group + 1} of 2</span>
          <button
            type="button"
            disabled={group === 1}
            onClick={() => navigate(1)}
          >
            Next questions <ArrowRight size={16} aria-hidden="true" />
          </button>
        </nav>
      </main>
    </div>
  );
}

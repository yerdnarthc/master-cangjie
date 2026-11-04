import { describe, it, expect } from "vitest";
import {
  evaluateQuiz,
  retainQuizSubmissionProgress,
  type QuizDefinition,
  type MultipleChoiceProgress,
} from "./quiz-evaluation.ts";

const sampleQuiz: QuizDefinition = {
  questions: Array.from({ length: 10 }, (_, i) => ({
    id: `q${i + 1}`,
    choices: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    correctChoiceId: "b",
    explanation: `Explanation for q${i + 1}`,
  })),
};

describe("Multiple-choice domain evaluation (UC-13)", () => {
  it("awards 100/100 and passes when all 10 answers are correct", () => {
    const answers = Object.fromEntries(
      sampleQuiz.questions.map((q) => [q.id, "b"]),
    );
    const result = evaluateQuiz(sampleQuiz, answers);
    expect(result.score).toEqual({ earned: 100, possible: 100 });
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(10);
    expect(result.unansweredCount).toBe(0);
    expect(
      result.questionResults.every(
        (r) => r.correct && r.earned === 10 && r.correctChoiceId === "b",
      ),
    ).toBe(true);
  });

  it("UC-13-AC1: exactly 6 correct answers yield 60/100 and pass", () => {
    const answers: Record<string, string> = {
      q1: "b",
      q2: "b",
      q3: "b",
      q4: "b",
      q5: "b",
      q6: "b", // 6 correct
      q7: "a",
      q8: "c",
      q9: "d",
      q10: "a", // 4 incorrect
    };
    const result = evaluateQuiz(sampleQuiz, answers);
    expect(result.score).toEqual({ earned: 60, possible: 100 });
    expect(result.passed).toBe(true);
    expect(result.correctCount).toBe(6);
  });

  it("UC-13-AC1: exactly 5 correct answers yield 50/100 and fail", () => {
    const answers: Record<string, string> = {
      q1: "b",
      q2: "b",
      q3: "b",
      q4: "b",
      q5: "b", // 5 correct
      q7: "a",
      q8: "c",
      q9: "d",
      q10: "a", // 4 incorrect
      // q6 omitted (unanswered)
    };
    const result = evaluateQuiz(sampleQuiz, answers);
    expect(result.score).toEqual({ earned: 50, possible: 100 });
    expect(result.passed).toBe(false);
    expect(result.correctCount).toBe(5);
    expect(result.unansweredCount).toBe(1);
    expect(result.questionResults[6]).toMatchObject({
      selectedChoiceId: "a",
      correct: false,
      correctChoiceId: "b",
    });
  });

  it("unanswered questions earn zero and are counted explicitly", () => {
    const result = evaluateQuiz(sampleQuiz, {});
    expect(result.score).toEqual({ earned: 0, possible: 100 });
    expect(result.passed).toBe(false);
    expect(result.unansweredCount).toBe(10);
    expect(result.correctCount).toBe(0);
    expect(
      result.questionResults.every(
        (r) =>
          !r.correct &&
          r.earned === 0 &&
          r.selectedChoiceId === null &&
          r.correctChoiceId === "b",
      ),
    ).toBe(true);
  });

  it("rejects an invalid choice that does not exist in the question", () => {
    expect(() => evaluateQuiz(sampleQuiz, { q1: "z" })).toThrow(
      /Selected choice "z" is not valid/,
    );
  });

  it("rejects a quiz definition with anything other than 10 questions", () => {
    const invalidQuiz: QuizDefinition = {
      questions: sampleQuiz.questions.slice(0, 9),
    };
    expect(() => evaluateQuiz(invalidQuiz, {})).toThrow(
      /must have exactly 10 questions/,
    );
  });
});

describe("Automatic multiple-choice progression", () => {
 const initial = { bestScore: null, completed: false, nextTopicAvailable: false };
 it.each([60,100])("automatically completes on %s/100", earned => {
  expect(retainQuizSubmissionProgress(initial,{earned,possible:100})).toMatchObject({ completed:true, nextTopicAvailable:true });
 });
 it("leaves a failing submission incomplete", () => {
  expect(retainQuizSubmissionProgress(initial,{earned:50,possible:100})).toMatchObject({ completed:false,nextTopicAvailable:false });
 });
 it("preserves prior passing completion on lower retry and replay", () => {
  const passed=retainQuizSubmissionProgress(initial,{earned:70,possible:100});
  const lower=retainQuizSubmissionProgress(passed,{earned:40,possible:100});
  expect(lower).toMatchObject({bestScore:{earned:70,possible:100},completed:true,nextTopicAvailable:true});
  expect(retainQuizSubmissionProgress(lower,{earned:40,possible:100})).toEqual(lower);
 });
 it("retains normalized best and earlier ties",()=> {
  const previous=retainQuizSubmissionProgress(initial,{earned:80,possible:100});
  expect(retainQuizSubmissionProgress(previous,{earned:90,possible:150}).bestScore).toEqual({earned:80,possible:100});
  expect(retainQuizSubmissionProgress(previous,{earned:40,possible:50}).bestScore).toEqual({earned:80,possible:100});
 });
});
